# C2-MCP

C2-MCP 是一个多端部署的 MCP Server，旨在为 LLM Agent 提供跨设备的工具执行能力（如文件读写、命令执行），并允许启用外接的人工审批机制。

## 总体架构

部署系统具有两类端点：Control 和 Beacon。

Control 是唯一的，一方面作为 MCP Server 与 MCP Client 连接，另一方面连接各设备上的 Beacon 端点。

Beacon 端运行在各个设备上，与 Control 通信，接收并运行来自 Control 的指令，返回执行结果。

## Control

Control 端监听两个 tcp 端口，分别作为 MCP Server 和连接各 Beacon 的中心节点提供服务。

### 作为 MCP Server

提供 HTTP Streamble MCP Server 的功能。

tools：

- `list_devices()`
- `read_file(device, path)`
- `shell(device, cwd, command)`
- `grep(device, cwd, pattern)`

特别的，设置一个 `info` 工具，用于收集 Beacon 运行环境的基本信息，包括平台、架构、系统版本、系统时间等等。这些信息在 Beacon 首次连接 Control 时一并发送，并作为 `list_devices` 的信息返回。

### 作为中心节点

WSS 服务器。与各设备上的 Beacon 建立加密连接。当 MCP Client 发起 tool call 时，根据 tool call 参数所选择的 device 封装命令执行请求，并路由给对应设备上的 Beacon；得到 Beacon 的响应后再将结果返回给 MCP Client。

## Beacon

不监听端口，仅可主动连接 Control 端；接收并运行来自 Control 端的命令。

## 密码学

Control 端和 Beacon 端之间的通信经过加密，并保证前向安全，密钥不落盘，仅保存在内存中。

**Control 端启动时：**

```
生成 ECDSA 密钥对（内存）
↓
生成自签名 X.509 证书（内存）
↓
计算证书 SHA-256 指纹
↓
生成随机 auth token（32字节）
↓
bootstrap_secret = base64url(token + fingerprint)  ← 展示给运维人员
```

**Beacon 端启动时，运维人员输入 bootstrap_secret：**

```
Beacon 发起 WSS 连接
↓
TLS 握手：不验证 CA 链，而是验证证书指纹是否匹配 bootstrap_secret 中的 fingerprint
↓  ← 证书验证通过 = 确认对端是持有该私钥的 Control
TLS 1.3 ECDHE 协商临时会话密钥（PFS）
↓
应用层：Beacon 发送 auth token，Control 验证
↓
bootstrap_secret 可以从内存中销毁，后续流量由 ECDHE 派生的临时密钥保护
```

## 目录结构

`control/` 和 `beacon/` 分别为两个终端各自的代码；如果有共用的代码，写在 `lib/` 中。

特别地，在 `tools/` 目录下编写工具代码，使用统一的工具格式定义，并用 zod 进行参数校验。这样可以发挥 monorepo 的优势，让 Control 和 Beacon 交互时、Control 作为 MCP Server 提供工具定义时、Beacon 执行工具时保持良好的一致性。

## 技术栈

对于未提及的需求，优先使用 Bun 原生的 API，参考 [Bun 官方文档](https://bun.com/docs/)

- 解析命令行参数：citty
- MCP Server：https://github.com/modelcontextprotocol/typescript-sdk
- 参数校验：zod

## 使用英文

所有提供给 LLM Agent 的信息（包括工具定义、工具报错信息等）应使用英文。

所有命令行输出的日志和提示信息应使用英文。