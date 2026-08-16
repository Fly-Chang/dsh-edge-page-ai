' Start the gateway silently in the background (double-click to run).
' Log file: <project root>\logs\gateway.log
' Stop: scripts\stop-gateway.bat
Option Explicit

Dim fso, shell, root, logDir, logFile, cmd, exitCode
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root

logDir = root & "\logs"
If Not fso.FolderExists(logDir) Then
  fso.CreateFolder(logDir)
End If
logFile = logDir & "\gateway.log"

exitCode = shell.Run("cmd /c node scripts\check-gateway-running.mjs", 0, True)
If exitCode = 0 Then
  MsgBox "OK: the gateway is already running at http://127.0.0.1:8787." & vbCrLf & _
         "No action needed. Use your bookmark in Edge.", vbInformation, "edge-page-ai - OK"
  WScript.Quit 0
End If

cmd = "cmd /c node src\gateway\server.js >> """ & logFile & """ 2>&1"
shell.Run cmd, 0, False
WScript.Sleep 2000

exitCode = shell.Run("cmd /c node scripts\check-gateway-running.mjs", 0, True)
If exitCode = 0 Then
  MsgBox "OK: the gateway started successfully at http://127.0.0.1:8787." & vbCrLf & _
         "Log file: " & logFile, vbInformation, "edge-page-ai - OK"
Else
  MsgBox "FAILED to start the gateway." & vbCrLf & _
         "See the log file: " & logFile, vbCritical, "edge-page-ai - ERROR"
End If