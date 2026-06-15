## Automatic Audit (run after every create or edit)

After creating or editing any skill, run this audit against all skills:

1. **Frontmatter check**: Every `SKILL.md` must start with `---` and have both `name` and `description` fields.
2. **Name match**: The `name` field must match the directory name.
3. **Trigger quality**: The `description` must contain trigger keywords (`use when`, `trigger`, `activates`, or `apply`) so DeepSeek can auto-discover it. Descriptions that only say what the skill IS (not WHEN to use it) will fail this check.
4. **Report**: List every skill with pass/fail for frontmatter, name match, and trigger quality. Highlight failures in red.

Fix failures immediately — a skill without frontmatter is invisible. A skill without trigger keywords won't auto-fire and must be named explicitly by the user.
