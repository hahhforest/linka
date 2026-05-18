# Phase 03A Room Store

## 最小交付范围

- migration v2 创建 `rooms`、`room_members`、`room_messages`，主键使用 text，复杂字段以 JSON 字符串落库。
- `RoomStore` 支持创建/读取/列出 Room，以及添加/列出 Room member。
- `MessageStore` 支持追加 Room message，并由 store 按 room 分配递增 `sequence`。
- 测试覆盖内存数据库迁移、创建 room、添加 2 个成员、追加 2 条消息、按 sequence 查询。

## 非目标

- 不做权限校验。
- 不做 Room 事件投递。
- 不做复杂 JSON schema 校验，解析失败先直接抛错。
