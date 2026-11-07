# dsh-zhipu-card

手填总额度 − DSH 会话 token 自动累计已用，展示剩余额度；并对 `ZAI_API_KEY` 做探活。智谱无公开余额接口，故为自设口径。

DSH（DeepSeek Harness）Web 端插件，无第三方依赖。

## 安装

```bash
git clone git@github.com:Duter2016/dsh-zhipu-card.git
cd dsh-zhipu-card
npm pack
dsh plugin --profile web add file:./dsh-zhipu-card-0.1.0.tgz
```

凭证在 DSH 凭据里配置 `ZAI_API_KEY`（`~/.dsh/.credentials.yaml`）。
tgz 请保留，pnpm 重装需要它。

## 结构

- `lib/index.js` — 服务端：路由、凭证探活、token 记账
- `lib/client.js` — 浏览器端：顶栏胶囊 + 弹出卡片
- `cordis.patch.yml` — bundle patch，挂载到 web profile

## 许可

MIT
