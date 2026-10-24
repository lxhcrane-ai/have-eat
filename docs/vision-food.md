# 餐食拍照识别（视觉模型）

拳王拍一张照片 → 云函数调多模态模型 → 返回**候选食物条目** → 拳王确认/改克数 → 随当日记录提交。规则引擎完全不用改：识别结果就是普通的 `meal.items`，只是带 `source: 'vision'`。

- 解析层：`miniprogram/utils/vision.js`（提示词 + JSON 提取 + 4/4/9 校验，双端共用）
- 云函数：`cloudfunctions/visionFood`
- 页面：`pages/log/log` 每餐的「识别」按钮 + 结果面板
- 测试：`node scripts/test-vision.js`（44 项）

---

## 一、为什么 key 不在小程序里

`miniprogram/config.js` 里的 `visionApi` / `visionKey` 已作废（保留字段只为兼容）。小程序代码包会被反编译，任何写在前端的 key 都等于公开。现在 key 只在**云函数环境变量**里：

| 环境变量 | 说明 | 例子 |
|---|---|---|
| `VISION_BASE_URL` | OpenAI 兼容的 `/chat/completions` 根地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `VISION_MODEL` | 视觉模型名 | `qwen-vl-max` / `glm-4v` / `doubao-vision-pro` |
| `VISION_API_KEY` | 供应商 key | `sk-...` |

配置位置：云开发控制台 → 云函数 → visionFood → 配置 → 环境变量。改完不用重新上传代码，但要**重新部署一次函数**让配置生效（工具里点「上传并部署」即可）。

未配置时：识别按钮仍可点，会返回明确提示"视觉模型未配置……先用添加食物手工记录"，不阻塞记录流程。这也是我们**不假装识别成功**的底线。

---

## 二、流程与接口

```
小程序                                    云函数 visionFood
chooseMedia → uploadFile → fileId  ──►  校验 openid / 每日 30 次配额
                                          downloadFile(fileId) ≤6MB
                                          buildMessages(dataUrl, hint)
                                          POST {baseUrl}/chat/completions
                                          normalizeVisionResult(content)
                  ◄── { items, warnings, note, totalKcal, disclaimer }
用户勾选 / 改克数 / 加入这餐
saveLog 照常提交（items.source='vision'）
```

`visionFood` 入参：

```js
{ action?: 'status', fileId: 'cloud://...', hint?: '这是午餐，有手掌参照', mime?: 'image/jpeg' }
```

返回：

```js
{ ok: true,
  items: [{ name:'米饭', grams:200, kcal:232, protein:5.2, carbs:51.8, fat:0.6, confidence:0.8, source:'vision' }],
  warnings: ['牛肉面：标注热量 900 kcal 与宏量反算 540 kcal 偏差过大，已按宏量重算'],
  note: '有手掌参照，份量较可靠',
  totalKcal: 480,
  provider: { baseUrl, model },
  disclaimer: '照片估算误差通常 ±20–30%…' }
```

失败一律带 `reason`，前端据此给不同文案，不会出现"识别成功但内容是空的"：

| reason | 场景 | 前端文案 |
|---|---|---|
| `not_configured` | 三个环境变量没填 | 视觉模型未配置，先用添加食物 |
| `quota` | 超过 30 次/天 | 今天识别次数已用完 |
| `auth` | 401/403 | key 无效，检查环境变量 |
| `rate` | 429 | 模型限流，等一分钟 |
| `timeout` | 25s 无响应 | 换一张更小的照片 |
| `too_large` | >6MB | 照片太大 |
| `file` | fileId 无效/已删 | 照片读取失败 |
| `upstream` | 5xx（已重试 1 次） | 模型服务异常 |
| `unparsable` | 模型没给 JSON | 返回格式异常，可重试 |
| `no_items` | 照片里没食物 | 换个角度、放参照物再拍 |

---

## 三、结果校验（解析层做的事）

模型输出不能直接信，`normalizeVisionResult` 会：

1. **抠 JSON**：容忍 ```json 代码块、前后废话、单条对象、直接传对象。
2. **字段别名**：`calories/热量`、`protein_g/蛋白质`、`weight_g/克数`、`conf/置信度` 等统一。
3. **数值清洗**：负数归零、克数 0–1500g（超了置空而不是猜）、单条热量上限 2500 kcal、条目最多 12 条（按热量保留）。
4. **4/4/9 自洽**：`4P + 4C + 9F` 与标注热量偏差 >35% 时，按宏量重算并写 warning（实测里"牛肉面 900 kcal / 宏量 540"就会被纠正）。
5. **失败即失败**：解析不出 JSON、`foods: []`、只有 note → `ok:false`，不返回任何条目。

`toMealItem()` 输出与食物库条目同构（`name/grams/kcal/protein/carbs/fat`），多一个 `source:'vision'` 与 `confidence`。所以 `sumMeals`、评分、告警、周报全都不用改。

---

## 四、界面

每餐卡片操作行：`复用上次 · 拍照 · 识别 · 删除`（识别只在照片上传成功、拿到 `fileId` 后出现）。

结果面板（底部弹出）：

```
照片识别结果                                    关闭
勾选的合计 480 kcal
[✓] 米饭     约 200g · 232 kcal · P5.2 C51.8 F0.6      [200]
[✓] 鸡胸肉   约 150g · 248 kcal · P46.5 C0 F5.4       [150]
· 牛肉面：标注热量与宏量反算偏差过大，已按宏量重算
模型说明：有手掌参照，份量较可靠
照片估算误差通常 ±20–30%，放个参照物（手、勺子、身份证）能明显提高准确度；确认前请按实际份量改克数。
[加入这餐（480 kcal）]
```

- 勾选框可取消单个条目；改克数会按比例重算热量与宏量（以模型原始值为基准，不会多次修改累积误差）。
- 加入后仍可在餐食里删除单项（`×`），和手工添加的食物一样。
- 整餐只要含一项 vision 条目，`meal.source='vision'`，周报/教练端能区分"估的"和"选的"。

---

## 五、已知边界

1. **误差 ±20–30%**：这是照片估算的物理极限，不是模型不行。放参照物、拍俯视、把盘子拍全能压到 ±15% 左右。UI 里固定显示这句，不藏。
2. **复合菜会拆分**：模型会把"鱼香肉丝"拆成肉丝/配菜，条目数偏多；超过 12 条会按热量截断，剩下的是主项。
3. **每日 30 次上限**：写在云函数里（`users.visionCalls/visionDate`），防止 key 被刷。要调改 `DAILY_LIMIT`。
4. **不落原始返回**：云函数只回结构化条目，不回模型原文（避免把整段文本塞进数据库）；解析失败时才回 200 字片段便于排查。
5. **不做菜品库匹配**：识别结果不会自动匹配 `utils/food.js`，因为模型给的份量/热量与食物库口径不同，硬匹配会引入第二层误差。

---

## 六、部署与验证

```bash
bash scripts/sync-shared.sh      # 把 utils/vision.js 同步到 cloudfunctions/visionFood/lib/
node scripts/test-vision.js      # 44 项：别名/垃圾输出/4-4-9 校验/失败路径/与规则引擎接缝
node scripts/preflight.js        # 检查 visionFood 存在、三个环境变量被读取、lib 同步
```

上传 `visionFood`（云端安装依赖）→ 配三个环境变量 → 真机拍一张有参照物的照片，确认：
1. 面板条目与照片对得上；
2. 改克数后热量按比例变化；
3. 断网/未配 key 时给出可读提示而不是白屏。
