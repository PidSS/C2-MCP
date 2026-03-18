# Control 设计

## 命令行参数

- `--mcp-listen`：MCP Server 监听的地址，`<host>:<port>` 格式，默认值 `localhost:4661`。
- `--control-listen`：接受 Beacon 连接的 WSS 服务监听的地址，`<host>:<port>` 格式，默认值 `0:4662`。
- `-v` / `--verbose`：是否启用详细日志。启用则包含 `debug` 和 `trace` 级别的日志，否则不包含。

## 管理 Beacon

Beacon 建立连接时声明的 `id` 是它的唯一识别符号，也就是说：如果已有 `id` 为 `macbook` 的 Beacon 连接，则其他声明自己 `id` 为 `macbook` 的新 Beacon 连接将不再被接受，除非前者已经断开释放。

维护一个 `Map<id, BeaconConnection>`，并进行适当的封装来获得良好的代码可读性和复用性。

`list_devices` 是一个特殊的工具，处理它时无需将命令发送到某个 Beacon 上，而是直接返回所有已连接的 beacon 的信息，包括 `id` 和它们通过 `info` 工具收集到的运行环境信息。

## 密码学

参考 ../AGENTS.md 中的密码学一节。Control 启动完成后，应在命令行输出新产生的 bootstrap_secret。

## 注意

Control 运行的全过程中，MCP Server 和 Control WSS Server 处理请求都是并发的，编码时应当充分考虑相关的时序 / 条件竞争 / 原子化问题。
