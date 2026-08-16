# 查看 DSH_* 模型环境变量的当前状态（不显示完整密钥）。
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-dsh-model-env.ps1

$names = @(
  'DSH_MODEL_API_KEY',
  'DSH_MODEL_PROVIDER',
  'DSH_MODEL_BASE_URL',
  'DSH_MODEL_NAME',
  'DSH_MODEL_TIMEOUT_MS',
  'DSH_MODEL_JSON_MODE',
  'DSH_MODEL_EXTRA_BODY'
)

foreach ($name in $names) {
  $userValue = [Environment]::GetEnvironmentVariable($name, 'User')
  $processValue = [Environment]::GetEnvironmentVariable($name, 'Process')

  if ($name -eq 'DSH_MODEL_API_KEY') {
    $userDisplay = if ($userValue) { $userValue.Substring(0, [Math]::Min(4, $userValue.Length)) + '****' + $userValue.Substring([Math]::Max(0, $userValue.Length - 4)) } else { '<empty>' }
    $processDisplay = if ($processValue) { $processValue.Substring(0, [Math]::Min(4, $processValue.Length)) + '****' + $processValue.Substring([Math]::Max(0, $processValue.Length - 4)) } else { '<empty>' }
  } else {
    $userDisplay = if ($userValue) { $userValue } else { '<empty>' }
    $processDisplay = if ($processValue) { $processValue } else { '<empty>' }
  }

  Write-Output ("{0,-24} user={1}  process={2}" -f $name, $userDisplay, $processDisplay)
}

$ready = [bool]([Environment]::GetEnvironmentVariable('DSH_MODEL_API_KEY', 'Process') -or [Environment]::GetEnvironmentVariable('DSH_MODEL_API_KEY', 'User'))
Write-Output ("`nmodel key ready: {0}" -f $ready)
