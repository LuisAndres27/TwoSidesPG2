$ErrorActionPreference = 'Stop'
# Invoke manually. No password arguments, transcript or plaintext console output.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$js = @'
try { const fs=require('fs');const c=JSON.parse(fs.readFileSync('/b85-private/credentials.json','utf8'));print(JSON.stringify({email:c.metabaseEmail,password:c.metabasePassword})); } catch { quit(1); }
'@
$raw = $js | & docker exec -i twosides-b85-analytics mongosh --quiet --norc --file /dev/stdin 2>$null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo recuperar el acceso local B85.' }
$account = $raw | ConvertFrom-Json
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Two Sides B85 — acceso local'; $form.Size = New-Object System.Drawing.Size(570,240)
$form.StartPosition = 'CenterScreen'
$label = New-Object System.Windows.Forms.Label
$label.Text = "Metabase local: http://127.0.0.1:4185/dashboard/2`r`nUsuario: $($account.email)`r`nContraseña sintética local (oculta):"
$label.Location = New-Object System.Drawing.Point(18,18);$label.Size = New-Object System.Drawing.Size(520,65)
$password = New-Object System.Windows.Forms.TextBox
$password.Location = New-Object System.Drawing.Point(18,88);$password.Width=510;$password.UseSystemPasswordChar=$true;$password.ReadOnly=$true;$password.Text=$account.password
$copy=New-Object System.Windows.Forms.Button
$copy.Text='Copiar contraseña';$copy.Location=New-Object System.Drawing.Point(18,130);$copy.Width=160
$copy.Add_Click({[System.Windows.Forms.Clipboard]::SetText($password.Text)})
$open=New-Object System.Windows.Forms.Button
$open.Text='Abrir Metabase';$open.Location=New-Object System.Drawing.Point(195,130);$open.Width=150
$open.Add_Click({Start-Process 'http://127.0.0.1:4185/dashboard/2'})
$form.Controls.AddRange(@($label,$password,$copy,$open))
try { [void]$form.ShowDialog() } finally {
 if ([System.Windows.Forms.Clipboard]::ContainsText() -and [System.Windows.Forms.Clipboard]::GetText() -ceq $password.Text) { [System.Windows.Forms.Clipboard]::Clear() }
 $password.Clear();$account=$null;$raw=$null;$form.Dispose()
}
