# 把 DeepSeek/模型配置写入当前 Windows 用户的 DSH_* 环境变量。
# 网关优先读取环境变量（见 src/gateway/config.js），不再把密钥写入 config.local.json。
#
# 用法（只设置密钥，其余使用 DeepSeek V4 Flash 低思考默认值）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-dsh-model-env.ps1 -ApiKey "sk-..."
#
# 常用参数:
#   -ApiKey             必填，DeepSeek API Key
#   -Provider           默认 openai-compatible
#   -BaseUrl            默认 https://api.deepseek.com
#   -ModelName          默认 deepseek-v4-flash
#   -TimeoutMs          默认 60000
#   -ReasoningEffort    默认 low（low / high / max）
#   -ThinkingType       默认 enabled（enabled / disabled）

param(
  [Parameter(Mandatory = $true)][string]$ApiKey,
  [string]$Provider = 'openai-compatible',
  [string]$BaseUrl = 'https://api.deepseek.com',
  [string]$ModelName = 'deepseek-v4-flash',
  [int]$TimeoutMs = 60000,
  [ValidateSet('low', 'high', 'max')][string]$ReasoningEffort = 'low',
  [ValidateSet('enabled', 'disabled')][string]$ThinkingType = 'enabled'
)

$extraBody = @{
  thinking = @{ type = $ThinkingType }
  reasoning_effort = $ReasoningEffort
} | ConvertTo-Json -Compress

$values = [ordered]@{
  DSH_MODEL_API_KEY    = $ApiKey
  DSH_MODEL_PROVIDER   = $Provider
  DSH_MODEL_BASE_URL   = $BaseUrl
  DSH_MODEL_NAME       = $ModelName
  DSH_MODEL_TIMEOUT_MS = [string]$TimeoutMs
  DSH_MODEL_JSON_MODE  = 'false'
  DSH_MODEL_EXTRA_BODY = $extraBody
}

foreach ($entry in $values.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
}

Write-Output 'DSH model environment variables have been saved (User scope).'
Write-Output 'Restart PowerShell / Edge / DSH, then run: npm start'
Write-Output "DSH_MODEL_API_KEY = $(($ApiKey.Substring(0, [Math]::Min(4, $ApiKey.Length))) + '****' + ($ApiKey.Substring([Math]::Max(0, $ApiKey.Length - 4))))"
