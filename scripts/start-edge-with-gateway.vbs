' Hidden companion launcher: starts gateway + Edge and monitors Edge close.
Option Explicit
Dim fso, shell, root, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & root & "\scripts\start-edge-with-gateway.ps1"""
shell.Run cmd, 0, False