# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [运维部署|构建方法|测试方法|排错调试|工作流协作|环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

[Use English for replies]
- Date: 2026-06-17
- Context: User corrected response language during workspace and sync support
- Instructions:
  - Use English for user-facing replies in this project unless the user changes the preference again.

[derp_docs writing rules]
- Date: 2026-06-17
- Context: User defined how shared documentation writing should behave for derp_docs markdown files
- Instructions:
  - Treat `derp_docs/` as an Obsidian vault when editing markdown there.
  - Keep `derp_docs` markdown readable in Obsidian, GitHub, and the current barebones `derpNotes` node.
  - Avoid advanced Obsidian-only markdown gimmicks that reduce cross-reader compatibility.
  - Keep tone slightly playful with only a light touch of humor.
  - Preserve the formatting conventions already established in the individual node instruction docs.
  - Reflect the motto "I know exactly what I want, just not sure how to get there... but you can't stop me." as attitude and voice when it fits, without overusing the exact quote.

[Theme and palette build order]
- Date: 2026-06-17
- Context: User defined the preferred design workflow for updating themes and palettes
- Instructions:
  - For both theme and palette work, always start from the main `_ON`, `_OFF`, and `_DIS` colors first.
  - Build stroke, shadow, and glow from the established main colors rather than designing effects independently first.
  - For theme work, start from the `canvas` key first because it sets the base LT/NE/DK tone, saturation, and transparency for the whole theme.
  - For theme size work, treat `_layout` and the text-key `font` and `fontSize` settings as one coordinated size system because together they determine how large or compact a node feels.
  - Text keys such as `t_textBig`, `t_textNormal`, `t_textSmall`, and `t_textSystem` should usually move together in scale rather than mixing unrelated size extremes, unless a special-case design is intended.
  - For theme and palette color work, use HSVA or HSLA as the main working language; treat RGBA as the JSON storage format.
  - Many related theme or palette entries should share similar saturation and lightness or value, with hue carrying most of the variation.
  - Warm hues from violet-purple through orange-yellow often need extra brightness or value and sometimes extra saturation so they do not look muddy compared with cooler hues.
  - For theme or palette work, establish the high-level goal before editing: whether it is Light, Neutral, or Dark, and whether it should feel clean, nearly monochromatic, or very vibrant. If that brief is missing, ask first.
