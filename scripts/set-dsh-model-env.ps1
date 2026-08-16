# Persist DSH_* model environment variables for the current Windows user.
# The gateway reads environment variables first (see src/gateway/config.js),
# so the API key never needs to be stored in config.local.json.
#
# Usage (set only the API key; other values default to DeepSeek V4 Flash low-thinking):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-dsh-model-env.ps1 -ApiKey "sk-..."
#
# Common parameters:
#   -ApiKey             required, DeepSeek API key
#   -Provider           default openai-compatible
#   -BaseUrl            default https://api.deepseek.com
#   -ModelName          default deepseek-v4-flash
#   -TimeoutMs          default 60000
#   -ReasoningEffort    default low (low / high / max)
#   -ThinkingType       default enabled (enabled / disabled)

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
