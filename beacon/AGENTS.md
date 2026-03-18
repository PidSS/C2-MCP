# Beacon 设计

## 命令行参数

- `--id`：Beacon 声明的 id，用于被 Control 识别，全局唯一。
- `control-address`：Beacon 主动连接的 WSS 服务的地址，`<host>:<port>` 格式，无默认值。
- `-v` / `--verbose`：是否启用详细日志。启用则包含 `debug` 和 `trace` 级别的日志，否则不包含。

## 结构

总地来说，每当 Beacon 收到 Control 的指令，就解析参数并分发给相应的工具执行。

## 密码学

参考 ../AGENTS.md 中的密码学一节。Beacon 启动时，应通过 `consola.prompt` 要求用户输入 bootstrap_secret，随后再尝试与 Control 建立连接
