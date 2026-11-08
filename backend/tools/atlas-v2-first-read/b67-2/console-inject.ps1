# B67.2 test helper (synthetic only): types the given text into the hidden console of a selftest run, via WriteConsoleInput.
# It targets only the powershell.exe whose command line contains the given fixture id. Never pass a real password.
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$Id,[Parameter(Mandatory)][ValidatePattern('^t:')][string]$Spec,[Parameter(Mandatory)][string]$OutFile,[switch]$NoEnter)
$ErrorActionPreference='Stop'
$Text=$Spec.Substring(2)   # 't:' prefix keeps an empty Enter-only input from being dropped as an empty argument
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class B67Inj{
 [DllImport("kernel32.dll",SetLastError=true)]public static extern bool FreeConsole();
 [DllImport("kernel32.dll",SetLastError=true)]public static extern bool AttachConsole(uint pid);
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)]public static extern IntPtr CreateFileW(string n,uint a,uint s,IntPtr sa,uint c,uint f,IntPtr t);
 [StructLayout(LayoutKind.Explicit,CharSet=CharSet.Unicode)]public struct REC{[FieldOffset(0)]public ushort EventType;[FieldOffset(4)]public int bKeyDown;[FieldOffset(8)]public ushort rep;[FieldOffset(10)]public ushort vk;[FieldOffset(12)]public ushort sc;[FieldOffset(14)]public char ch;[FieldOffset(16)]public uint ctl;}
 [DllImport("kernel32.dll",SetLastError=true)]public static extern bool WriteConsoleInputW(IntPtr h,REC[] r,uint n,out uint w);
 public static void Send(uint pid,string text,bool enter){
  FreeConsole(); if(!AttachConsole(pid))throw new Exception("attach");
  IntPtr h=CreateFileW("CONIN$",0xC0000000,3,IntPtr.Zero,3,0,IntPtr.Zero);
  var l=new System.Collections.Generic.List<REC>();
  foreach(char c in text){l.Add(new REC{EventType=1,bKeyDown=1,rep=1,ch=c});l.Add(new REC{EventType=1,bKeyDown=0,rep=1,ch=c});}
  if(enter){l.Add(new REC{EventType=1,bKeyDown=1,rep=1,vk=13,sc=28,ch='\r'});l.Add(new REC{EventType=1,bKeyDown=0,rep=1,vk=13,sc=28,ch='\r'});}
  uint w;var a=l.ToArray();if(!WriteConsoleInputW(h,a,(uint)a.Length,out w))throw new Exception("write");
 }}
'@
for($i=0;$i -lt 180;$i++){ if((Test-Path -LiteralPath $OutFile) -and ((Get-Content -LiteralPath $OutFile -Raw) -match 'B67_STAGE=input waiting')){break}; Start-Sleep -Milliseconds 500 }
Start-Sleep -Milliseconds 800
$p=Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like ('*'+$Id+'*offline-selftest.ps1*') -and $_.CommandLine -notlike '*-Automation*' -and $_.ProcessId -ne $PID } | Select-Object -First 1
if(-not $p){ 'no-target'; exit 2 }
[B67Inj]::Send([uint32]$p.ProcessId,$Text,-not $NoEnter); 'injected'
