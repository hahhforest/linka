import type { RoomMember, RoomMention } from "@linka/shared";

interface MentionCandidate {
  readonly member: RoomMember;
  readonly displayName: string;
  readonly normalizedDisplayName: string;
  readonly canMatchWithoutBoundary: boolean;
}

const boundaryCharacters = new Set([
  " ",
  "\n",
  "\r",
  "\t",
  ".",
  ",",
  "!",
  "?",
  ";",
  ":",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "<",
  ">",
  '"',
  "'",
  "，",
  "。",
  "！",
  "？",
  "、",
  "；",
  "：",
  "（",
  "）",
  "【",
  "】",
  "《",
  "》",
  "“",
  "”",
  "‘",
  "’",
]);

const containsNonAscii = (value: string): boolean => /[^\u0000-\u007f]/u.test(value);

const isBoundaryCharacter = (character: string | undefined): boolean =>
  character === undefined || boundaryCharacters.has(character);

const isMentionStart = (text: string, atIndex: number): boolean =>
  isBoundaryCharacter(atIndex > 0 ? text[atIndex - 1] : undefined);

const isMentionEnd = (character: string | undefined): boolean =>
  isBoundaryCharacter(character) || containsNonAscii(character ?? "");

const normalizeMentionText = (value: string): string => value.toLocaleLowerCase("zh-CN");

const toMentionCandidates = (members: readonly RoomMember[]): readonly MentionCandidate[] =>
  members
    .filter(
      (member) =>
        member.status === "active" &&
        (member.kind === "human" || member.kind === "agent") &&
        member.displayName.trim().length > 0,
    )
    .map((member) => {
      const displayName = member.displayName.trim();

      return {
        member,
        displayName,
        normalizedDisplayName: normalizeMentionText(displayName),
        canMatchWithoutBoundary: containsNonAscii(displayName),
      };
    })
    .sort((left, right) => right.displayName.length - left.displayName.length);

const startsWithCandidate = (
  text: string,
  displayNameStartIndex: number,
  candidate: MentionCandidate,
): boolean => {
  const rawSegment = text.slice(
    displayNameStartIndex,
    displayNameStartIndex + candidate.displayName.length,
  );

  return normalizeMentionText(rawSegment) === candidate.normalizedDisplayName;
};

const findMentionCandidate = (
  text: string,
  displayNameStartIndex: number,
  candidates: readonly MentionCandidate[],
): MentionCandidate | undefined => {
  const strictCandidate = candidates.find((candidate) => {
    const displayNameEndIndex = displayNameStartIndex + candidate.displayName.length;

    return (
      startsWithCandidate(text, displayNameStartIndex, candidate) &&
      isMentionEnd(text[displayNameEndIndex])
    );
  });

  if (strictCandidate) {
    return strictCandidate;
  }

  return candidates.find(
    (candidate) =>
      candidate.canMatchWithoutBoundary &&
      startsWithCandidate(text, displayNameStartIndex, candidate),
  );
};

export const parseComposerMentions = (
  text: string,
  members: readonly RoomMember[],
): readonly RoomMention[] => {
  const candidates = toMentionCandidates(members);
  const mentions: RoomMention[] = [];
  const mentionedMemberIds = new Set<string>();

  if (candidates.length === 0) {
    return mentions;
  }

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "@" || !isMentionStart(text, index)) {
      continue;
    }

    const candidate = findMentionCandidate(text, index + 1, candidates);

    if (!candidate || mentionedMemberIds.has(candidate.member.id)) {
      continue;
    }

    mentionedMemberIds.add(candidate.member.id);
    mentions.push({
      memberId: candidate.member.id,
      displayText: `@${candidate.displayName}`,
    });
  }

  return mentions;
};
