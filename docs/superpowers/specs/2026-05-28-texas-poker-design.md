# Web 德州扑克设计规格

## 目标

实现一个轻量网页版德州扑克，供朋友临时开房间一起玩。系统不要求登录，不落库，房间、玩家、牌局和筹码状态全部保存在服务端内存中。页面只需要有正常扑克游戏观感，优先保证规则正确、交互清晰、实时同步稳定。

## 技术方案

采用单仓单服务方案：

- 前端：Vite + React + TypeScript，负责大厅、牌桌、下注控件、补码申请、结算弹窗。
- 服务端：Node.js + Express + Socket.IO，负责静态资源、session、房间管理和实时事件。
- 规则核心：独立 TypeScript 模块，不依赖 React 或 Socket.IO，负责洗牌、发牌、行动顺序、下注合法性、阶段推进、边池、牌型比较和底池分配。
- 存储：服务端内存 Map。进程重启后房间消失，符合“轻量、无需落库”的目标。

## 核心规则

游戏按无限注德州扑克现金局实现：

1. 每手牌开始时，按钮位移动到下一位可参与玩家。
2. 自动扣小盲和大盲。
3. 若房间开启 straddle，UTG 玩家在发手牌前进入 straddle 决策；选择 straddle 时下注额为 2 倍大盲，作为第三盲。
4. 每名参与玩家发两张手牌。
5. 阶段按 `waiting -> straddleDecision -> preflop -> flop -> turn -> river -> showdown -> handComplete` 推进。
6. 翻牌前行动顺序：
   - 无 straddle：从大盲左侧第一个仍可行动玩家开始。
   - 有 UTG straddle：从 straddle 玩家左侧第一个仍可行动玩家开始，straddle 玩家翻牌前最后行动并保留加注权。
7. 翻牌后行动从按钮左侧第一个未弃牌且未 all-in 的玩家开始。
8. 玩家可执行 `check`、`call`、`fold`、`bet`、`raise`、`all-in`，服务端根据当前下注额、最小加注额、玩家筹码和阶段判断是否合法。`bet` 和 `raise` 的金额表示本轮下注总额；前端快捷下注只填入合法范围内的建议值，最终仍由服务端校验。
9. 若只剩一名未弃牌玩家，本手牌立即结束并把全部可赢底池分给该玩家。
10. 若 all-in 后仍有两名或更多未弃牌玩家，但剩余可继续下注的玩家少于两名，则自动发完剩余公共牌并进入摊牌。
11. 若 all-in 后仍有两名或更多玩家持有筹码且可继续下注，则 all-in 玩家后续行动轮会被跳过，其他玩家继续完成后续下注轮。
12. 若 river 后仍有多名未弃牌玩家，进入摊牌，使用每人两张手牌和五张公共牌组成最佳五张牌比较胜负。
13. 支持 all-in 和边池。玩家只能赢取自己有资格参与的底池；同牌型平分，无法整除的零头按按钮左侧顺时针顺序分配。

牌型从高到低为：皇家同花顺、同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。A 可在 A-K-Q-J-10 中作最大，也可在 A-2-3-4-5 中作最小。

## 必要核心函数

规则核心至少包含这些纯函数或近似纯函数：

- `createDeck(seed?)`：创建并洗牌。
- `dealHoleCards(state)`：给参与玩家发两张手牌。
- `postBlinds(state)`：扣大小盲并记录本轮投入。
- `offerStraddle(state)`：判断当前是否需要 straddle 决策。
- `postStraddle(state, playerId)`：扣 straddle 并更新翻牌前首个行动玩家。
- `getNextActor(state)`：计算下一个可行动玩家。
- `getLegalActions(state, playerId)`：返回当前玩家可执行动作和金额边界。
- `applyAction(state, action)`：应用 fold/check/call/bet/raise/all-in。
- `isBettingRoundComplete(state)`：判断当前下注轮是否完成。
- `advanceStreet(state)`：发 flop/turn/river 或进入 showdown。
- `buildPots(players)`：根据每个玩家本手投入构建主池和边池。
- `evaluateBestHand(holeCards, communityCards)`：七选五计算最佳牌型。
- `compareHands(a, b)`：比较两个最佳牌型。
- `settlePots(state)`：按边池资格和牌型分配筹码。
- `calculateRoomSettlement(room)`：计算每个玩家 `currentChips + pendingTopUp - totalInvested`。

## 用户身份与心跳

用户无需注册登录。首次访问时服务端生成 sessionId，并通过 cookie 维持身份。用户只能修改自己的昵称，不能修改其他玩家信息。

客户端每 10 秒发送一次心跳。服务端若 30 秒未收到某用户心跳，则判定离线：

- 若用户在大厅，仅标记离线。
- 若用户在房间且当前没有进行中的手牌，按离开房间处理。
- 若用户在进行中的手牌中，服务端自动执行弃牌；其本手已投入筹码留在底池。
- 房主离线或退出后，房主转移给仍在线、进入房间顺序最靠前的玩家。
- 房间内所有玩家退出或离线超时后，房间自动解散并从大厅消失。

## 大厅与房间

大厅展示当前内存中的房间列表，包括房间号、人数、盲注、是否支持 straddle、是否有密码、房主昵称和当前状态。

创建房间时可配置：

- 小盲和大盲。
- 是否支持 UTG straddle。
- 可选房间密码。

房间号为 4 位数字。加入有密码房间时必须输入正确密码。房间状态只保存在内存中，服务重启或房间解散后不可恢复。

房主能力：

- 点击“开始下一局/发牌”开始新一手牌。
- 审批玩家补码申请。
- 点击“结算”查看当前每个人输赢。
- 设置或修改房间密码。
- 点击“解散房间”踢出所有人并删除房间。

## 牌桌交互

牌桌 UI 包含玩家座位、公共牌、底池、当前阶段、当前行动玩家、自己的手牌、操作按钮和房主工具。第一使用场景是手机等小屏设备，因此牌桌应采用移动端横屏优先设计：尽量在一个屏幕内展示牌桌、玩家座位、自己的手牌、操作区、个人信息和消息列表。房主设置类操作收纳到右上角“房主设置”按钮中展开，避免长期占用牌桌空间。

轮到玩家行动时，前端根据服务端下发的合法动作展示按钮：

- `fold`
- `check`
- `call`
- `bet`
- `raise`
- `all-in`

下注金额使用输入框。旁边提供快捷选择：

- 底池 `1/3`
- 底池 `1/2`
- 底池 `2/3`
- 底池 `1x`

快捷按钮只负责把金额填入输入框，玩家仍可手动修改。最终提交时由服务端校验金额是否合法。

## 补码

玩家只能在一局结束后、下一局开始前向房主提交补码申请，包含申请筹码数量；手牌进行中前端按钮禁用，服务端也会拒绝申请。补码申请展示在牌桌侧边消息列表中，房主可直接批准。房主批准后：

- 增加玩家累计补码 `totalInvested`。
- 因为申请只允许发生在局间，批准后立即增加当前筹码。

这遵循现金局 table stakes 原则：玩家不能在一手牌中途用新增筹码扩大当前手牌可下注额。

## 结算

结算只计算结果，不结束游戏、不删除房间、不强制停止当前牌局。

每个玩家维护：

- `currentChips`：当前筹码。
- `totalInvested`：初始带入加所有已批准补码。
- `pendingTopUp`：已批准但等待下一手生效的补码。

房主点击结算时，展示每个玩家：

`net = currentChips + pendingTopUp - totalInvested`

如果没有手牌进行中，`pendingTopUp` 通常为 0。结算结果额外展示全桌合计，用于确认接近 0；若存在四舍五入或零头分配，应仍以实际筹码为准。

## 实时事件

客户端到服务端：

- `session:updateNickname`
- `lobby:listRooms`
- `room:create`
- `room:join`
- `room:leave`
- `room:setPassword`
- `room:dismiss`
- `room:startHand`
- `room:requestTopUp`
- `room:approveTopUp`
- `game:chooseStraddle`
- `game:act`
- `heartbeat`

服务端到客户端：

- `session:state`
- `lobby:roomsUpdated`
- `room:state`
- `room:error`
- `game:state`
- `game:privateState`
- `settlement:result`
- `notification`

公共状态不包含其他玩家手牌。每个玩家自己的手牌通过私有事件单独发送。

## 错误处理

服务端是权威状态源。所有客户端动作都必须校验：

- session 是否存在。
- 玩家是否在房间内。
- 是否轮到该玩家。
- 动作是否在合法动作集合中。
- 下注金额是否满足最小下注、最小加注和筹码上限。
- 房主操作是否由当前房主发起。
- 房间密码是否正确。

非法动作不改变状态，只返回错误提示。断线重连后，客户端通过 sessionId 恢复当前房间视图；若房间已解散，则回到大厅。

## 测试范围

优先编写规则核心单元测试：

- 牌型比较：所有牌型、踢脚、A2345 顺子、平分。
- 行动顺序：普通局、straddle 局、翻牌后首位行动。
- 下注合法性：check/call/bet/raise/all-in、最小加注、筹码不足。
- 边池：单个 all-in、多个 all-in、不同玩家赢不同边池。
- 阶段推进：preflop/flop/turn/river/showdown。
- 断线弃牌：进行中退出自动 fold。
- 房主转移：房主退出后转给仍在线的最早进入玩家。
- 补码：进行中批准下一手生效。
- 结算：`currentChips + pendingTopUp - totalInvested`。

UI 测试以手动验证为主，确保大厅、创建房间、加入房间、发牌、下注、补码、结算、解散和断线重连可用。

## 非目标

- 不做账号系统。
- 不接数据库。
- 不做防作弊到生产级别。
- 不实现锦标赛规则。
- 不支持多种 straddle 变体；第一版只支持 UTG straddle。
- 不做复杂视觉设计，只保证扑克桌基本观感和可用性。
