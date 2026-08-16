' 静默后台启动网关（双击运行，不显示窗口）。
' 日志写入 <项目根目录>\logs\gateway.log；停止请双击 scripts\stop-gateway.bat。
Option Explicit

Dim fso, shell, root, logDir, logFile, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root

logDir = root & "\logs"
If Not fso.FolderExists(logDir) Then
  fso.CreateFolder(logDir)
End If
logFile = logDir & "\gateway.log"

cmd = "cmd /c node src\gateway\server.js >> """ & logFile & """ 2>&1"
shell.Run cmd, 0, False

MsgBox "edge-page-ai gateway started in background." & vbCrLf & vbCrLf & _
       "Log file: " & logFile & vbCrLf & _
       "Stop: scripts\stop-gateway.bat", vbInformation, "edge-page-ai"
