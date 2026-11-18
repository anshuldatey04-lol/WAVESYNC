Add-Type -AssemblyName System.Drawing

$rootDir = Resolve-Path "."
$publicDir = Join-Path $rootDir "public"
$electronDir = Join-Path $rootDir "electron"
$buildDir = Join-Path $rootDir "build"

New-Item -ItemType Directory -Force -Path $publicDir | Out-Null
New-Item -ItemType Directory -Force -Path $electronDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

function Draw-SyncWaveBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 512.0

    # Draw Squircle Background
    $pad = 16.0 * $scale
    $sqSize = 480.0 * $scale
    $corner = 110.0 * $scale

    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bgPath.AddArc($pad, $pad, $corner, $corner, 180, 90)
    $bgPath.AddArc($pad + $sqSize - $corner, $pad, $corner, $corner, 270, 90)
    $bgPath.AddArc($pad + $sqSize - $corner, $pad + $sqSize - $corner, $corner, $corner, 0, 90)
    $bgPath.AddArc($pad, $pad + $sqSize - $corner, $corner, $corner, 90, 90)
    $bgPath.CloseFigure()

    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($size, $size)),
        [System.Drawing.Color]::FromArgb(255, 12, 17, 34),
        [System.Drawing.Color]::FromArgb(255, 4, 5, 8)
    )
    $g.FillPath($bgBrush, $bgPath)
    $bgBrush.Dispose()

    # Glowing Border
    $borderPen = New-Object System.Drawing.Pen(
        (New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.PointF(0, 0)),
            (New-Object System.Drawing.PointF($size, $size)),
            [System.Drawing.Color]::FromArgb(220, 56, 189, 248),
            [System.Drawing.Color]::FromArgb(200, 192, 132, 252)
        )),
        [Math]::Max(1.0, 4.0 * $scale)
    )
    $g.DrawPath($borderPen, $bgPath)
    $borderPen.Dispose()
    $bgPath.Dispose()

    # Ambient Glow
    $glowPath1 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath1.AddEllipse(80.0 * $scale, 80.0 * $scale, 240.0 * $scale, 240.0 * $scale)
    $pgh1 = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath1)
    $pgh1.CenterColor = [System.Drawing.Color]::FromArgb(45, 0, 245, 255)
    $pgh1.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 245, 255))
    $g.FillPath($pgh1, $glowPath1)
    $pgh1.Dispose()
    $glowPath1.Dispose()

    $glowPath2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath2.AddEllipse(220.0 * $scale, 200.0 * $scale, 240.0 * $scale, 240.0 * $scale)
    $pgh2 = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath2)
    $pgh2.CenterColor = [System.Drawing.Color]::FromArgb(45, 168, 85, 247)
    $pgh2.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 168, 85, 247))
    $g.FillPath($pgh2, $glowPath2)
    $pgh2.Dispose()
    $glowPath2.Dispose()

    # Outer Broadcast Arcs (Left side)
    $arcPen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 56, 189, 248), [Math]::Max(1.0, 6.0 * $scale))
    $arcPen1.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcPen1.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($arcPen1, (70.0 * $scale), (140.0 * $scale), (232.0 * $scale), (232.0 * $scale), 130, 100)
    $arcPen1.Color = [System.Drawing.Color]::FromArgb(50, 0, 245, 255)
    $arcPen1.Width = [Math]::Max(1.0, 5.0 * $scale)
    $g.DrawArc($arcPen1, (35.0 * $scale), (105.0 * $scale), (302.0 * $scale), (302.0 * $scale), 135, 90)
    $arcPen1.Dispose()

    # Outer Broadcast Arcs (Right side)
    $arcPen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 168, 85, 247), [Math]::Max(1.0, 6.0 * $scale))
    $arcPen2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcPen2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($arcPen2, (210.0 * $scale), (140.0 * $scale), (232.0 * $scale), (232.0 * $scale), -50, 100)
    $arcPen2.Color = [System.Drawing.Color]::FromArgb(50, 236, 72, 153)
    $arcPen2.Width = [Math]::Max(1.0, 5.0 * $scale)
    $g.DrawArc($arcPen2, (175.0 * $scale), (105.0 * $scale), (302.0 * $scale), (302.0 * $scale), -45, 90)
    $arcPen2.Dispose()

    # Equalizer Bars definition: (centerX, height, color)
    $bars = @(
        @{ X = 138; H = 64;  C = [System.Drawing.Color]::FromArgb(255, 0, 245, 255) },
        @{ X = 168; H = 120; C = [System.Drawing.Color]::FromArgb(255, 56, 189, 248) },
        @{ X = 198; H = 180; C = [System.Drawing.Color]::FromArgb(255, 96, 165, 250) },
        @{ X = 228; H = 240; C = [System.Drawing.Color]::FromArgb(255, 129, 140, 248) },
        @{ X = 256; H = 290; C = [System.Drawing.Color]::FromArgb(255, 255, 255, 255) },
        @{ X = 284; H = 240; C = [System.Drawing.Color]::FromArgb(255, 168, 85, 247) },
        @{ X = 314; H = 180; C = [System.Drawing.Color]::FromArgb(255, 192, 132, 252) },
        @{ X = 344; H = 120; C = [System.Drawing.Color]::FromArgb(255, 236, 72, 153) },
        @{ X = 374; H = 64;  C = [System.Drawing.Color]::FromArgb(255, 244, 63, 94) }
    )

    $barW = [Math]::Max(2.0, 13.0 * $scale)
    $rad = $barW / 2.0

    foreach ($b in $bars) {
        $bx = ($b.X * $scale) - ($barW / 2.0)
        $bh = [Math]::Max(4.0, $b.H * $scale)
        $by = ($size / 2.0) - ($bh / 2.0)

        $barPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $barPath.AddArc($bx, $by, $barW, $barW, 180, 180)
        $barPath.AddLine($bx + $barW, $by + $rad, $bx + $barW, $by + $bh - $rad)
        $barPath.AddArc($bx, $by + $bh - $barW, $barW, $barW, 0, 180)
        $barPath.CloseFigure()

        $barBrush = New-Object System.Drawing.SolidBrush($b.C)
        $g.FillPath($barBrush, $barPath)
        $barBrush.Dispose()
        $barPath.Dispose()
    }

    # Flowing Sine Wave (Glow & Core)
    [System.Drawing.PointF[]]$wavePoints = @(
        (New-Object System.Drawing.PointF (90.0 * $scale), (256.0 * $scale)),
        (New-Object System.Drawing.PointF (130.0 * $scale), (180.0 * $scale)),
        (New-Object System.Drawing.PointF (180.0 * $scale), (180.0 * $scale)),
        (New-Object System.Drawing.PointF (220.0 * $scale), (256.0 * $scale)),
        (New-Object System.Drawing.PointF (260.0 * $scale), (330.0 * $scale)),
        (New-Object System.Drawing.PointF (310.0 * $scale), (330.0 * $scale)),
        (New-Object System.Drawing.PointF (350.0 * $scale), (256.0 * $scale)),
        (New-Object System.Drawing.PointF (385.0 * $scale), (190.0 * $scale)),
        (New-Object System.Drawing.PointF (422.0 * $scale), (256.0 * $scale))
    )

    $waveGlowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 0, 245, 255), [Math]::Max(2.0, 8.0 * $scale))
    $waveGlowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $waveGlowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawCurve($waveGlowPen, $wavePoints, 0.5)
    $waveGlowPen.Dispose()

    $waveCorePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(250, 255, 255, 255), [Math]::Max(1.0, 3.0 * $scale))
    $waveCorePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $waveCorePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawCurve($waveCorePen, $wavePoints, 0.5)
    $waveCorePen.Dispose()

    # Center Pulse Ring & Node
    $centerRingPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 56, 189, 248), [Math]::Max(1.0, 3.0 * $scale))
    $ringR = 15.0 * $scale
    $g.DrawEllipse($centerRingPen, ($size/2.0 - $ringR), ($size/2.0 - $ringR), ($ringR * 2.0), ($ringR * 2.0))
    $centerRingPen.Dispose()

    $centerNodeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $nodeR = 6.0 * $scale
    $g.FillEllipse($centerNodeBrush, ($size/2.0 - $nodeR), ($size/2.0 - $nodeR), ($nodeR * 2.0), ($nodeR * 2.0))
    $centerNodeBrush.Dispose()

    $g.Dispose()
    return $bmp
}

function Save-Ico([System.Drawing.Bitmap[]]$bitmaps, [string]$icoPath) {
    $stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($stream)

    $count = $bitmaps.Length
    # ICONDIR
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Icon type
    $bw.Write([uint16]$count)

    # Convert each bitmap to PNG byte array
    $pngDatas = New-Object System.Collections.ArrayList
    foreach ($bmp in $bitmaps) {
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngDatas.Add($ms.ToArray()) | Out-Null
        $ms.Dispose()
    }

    $headerSize = 6 + ($count * 16)
    $offset = $headerSize

    for ($i = 0; $i -lt $count; $i++) {
        $bmp = $bitmaps[$i]
        $data = $pngDatas[$i]
        $w = if ($bmp.Width -ge 256) { 0 } else { [byte]$bmp.Width }
        $h = if ($bmp.Height -ge 256) { 0 } else { [byte]$bmp.Height }

        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0) # Color count
        $bw.Write([byte]0) # Reserved
        $bw.Write([uint16]1) # Planes
        $bw.Write([uint16]32) # Bit count
        $bw.Write([uint32]$data.Length) # Bytes in res
        $bw.Write([uint32]$offset) # Image offset

        $offset += $data.Length
    }

    for ($i = 0; $i -lt $count; $i++) {
        $data = $pngDatas[$i]
        $bw.Write($data, 0, $data.Length)
    }

    $bw.Flush()
    $bw.Close()
    $stream.Dispose()
}

Write-Output "Generating multi-resolution bitmaps..."
$bmp512 = Draw-SyncWaveBitmap 512
$bmp256 = Draw-SyncWaveBitmap 256
$bmp128 = Draw-SyncWaveBitmap 128
$bmp64  = Draw-SyncWaveBitmap 64
$bmp48  = Draw-SyncWaveBitmap 48
$bmp32  = Draw-SyncWaveBitmap 32
$bmp16  = Draw-SyncWaveBitmap 16

# Save PNGs
Write-Output "Saving PNG assets..."
$bmp512.Save((Join-Path $publicDir "icon-512.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Save((Join-Path $publicDir "logo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Save((Join-Path $publicDir "icon-256.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Save((Join-Path $electronDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Save((Join-Path $buildDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)

# Save ICOs
Write-Output "Generating Windows ICO files with 256, 128, 64, 48, 32, 16 px resolutions..."
$icoBitmaps = @($bmp256, $bmp128, $bmp64, $bmp48, $bmp32, $bmp16)
Save-Ico $icoBitmaps (Join-Path $publicDir "favicon.ico")
Save-Ico $icoBitmaps (Join-Path $electronDir "icon.ico")
Save-Ico $icoBitmaps (Join-Path $buildDir "icon.ico")

$bmp512.Dispose()
$bmp256.Dispose()
$bmp128.Dispose()
$bmp64.Dispose()
$bmp48.Dispose()
$bmp32.Dispose()
$bmp16.Dispose()

Write-Output "Logo and Icon assets generation completed successfully!"
