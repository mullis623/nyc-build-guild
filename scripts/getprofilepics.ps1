$users = @(
    "sundeeph@microsoft.com"
    "skowalik@microsoft.com"
)

$assetsPath = Join-Path $PSScriptRoot "..\assets"
Add-Type -AssemblyName System.Drawing

foreach ($user in $users) {
    $username = $user.Split("@")[0]
    $out = Join-Path $assetsPath "$username.png"

    $response = Invoke-MgGraphRequest `
        -Method GET `
        -Uri "https://graph.microsoft.com/v1.0/users/$user/photos/120x120/`$value" `
        -OutputType HttpResponseMessage

    $stream = $response.Content.ReadAsStream()
    $image = $null

    try {
        $image = [System.Drawing.Image]::FromStream($stream)
        $image.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        if ($null -ne $image) {
            $image.Dispose()
        }

        $stream.Dispose()
        $response.Dispose()
    }
}
