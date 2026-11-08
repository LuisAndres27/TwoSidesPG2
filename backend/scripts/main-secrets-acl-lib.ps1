# Pure ACL policy for the private secrets directory of the main backend. READ-ONLY by construction: it evaluates security descriptors (from disk or built in memory)
# and returns failure codes. It never reads file contents, never changes an ACL or an owner, never deletes or creates anything.
Set-StrictMode -Version Latest

function Get-SecretsAclFailures {
    param(
        [Parameter(Mandatory = $true)][System.Security.AccessControl.FileSystemSecurity]$Security,
        [Parameter(Mandatory = $true)][Security.Principal.SecurityIdentifier]$UserSid,
        [bool]$IsDirectory = $true,
        [bool]$ExpectProtected = $true
    )
    $system = New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'
    $admins = New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544'
    $allowed = @($UserSid.Value, $system.Value, $admins.Value)
    $failures = New-Object System.Collections.Generic.List[string]
    $rules = @($Security.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($ExpectProtected -and -not $Security.AreAccessRulesProtected) { $failures.Add('inheritance_enabled') }
    $owner = $Security.GetOwner([Security.Principal.SecurityIdentifier])
    if ($owner.Value -ne $UserSid.Value -and $owner.Value -ne $admins.Value) { $failures.Add('unexpected_owner') }
    if (@($rules | Where-Object { $_.AccessControlType -eq 'Deny' }).Count -gt 0) { $failures.Add('deny_rule_present') }
    $allows = @($rules | Where-Object { $_.AccessControlType -eq 'Allow' })
    foreach ($rule in $allows) { if ($allowed -notcontains $rule.IdentityReference.Value) { $failures.Add('unexpected_identity') ; break } }
    foreach ($sid in $allowed) {
        $mine = @($allows | Where-Object { $_.IdentityReference.Value -eq $sid })
        if ($mine.Count -lt 1) { $failures.Add('missing_identity') ; continue }
        $full = @($mine | Where-Object { ([int]$_.FileSystemRights -band 0x1F01FF) -eq 0x1F01FF })
        if ($full.Count -lt 1) { $failures.Add('not_full_control') }
    }
    if ($IsDirectory) {
        $flags = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        foreach ($rule in $allows) { if (-not $rule.IsInherited -and $rule.InheritanceFlags -ne $flags) { $failures.Add('rule_does_not_inherit_to_children') ; break } }
    }
    return @($failures | Select-Object -Unique)
}
