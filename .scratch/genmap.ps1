Add-Type -AssemblyName System.Drawing

$W = 2048
$H = 1024
$root = "C:\Users\ASUS\Desktop\viajandoporelmundo"
$landFile = Join-Path $root ".scratch\land50.geojson"
$outFile  = Join-Path $root "public\pokemon-map.png"

Write-Host "Parsing GeoJSON..."
$gj = Get-Content $landFile -Raw | ConvertFrom-Json

# Marker colors used during rasterization (no antialiasing so they stay pure)
$cOcean = [System.Drawing.Color]::FromArgb(0,0,255)
$cLand  = [System.Drawing.Color]::FromArgb(0,255,0)
$cCoast = [System.Drawing.Color]::FromArgb(255,0,0)

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.Clear($cOcean)

$landBrush = New-Object System.Drawing.SolidBrush($cLand)
$coastPen = New-Object System.Drawing.Pen($cCoast, 3.0)

function Lng2X([double]$lng) { return [float]((($lng + 180.0) / 360.0) * $W) }
function Lat2Y([double]$lat) { return [float]((( 90.0 - $lat) / 180.0) * $H) }

# Collect all polygons; each polygon = array of rings; ring = array of PointF
$paths = New-Object System.Collections.Generic.List[System.Drawing.Drawing2D.GraphicsPath]

function Add-Polygon($rings) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate
    foreach ($ring in $rings) {
        $n = $ring.Count
        if ($n -lt 3) { continue }
        $pts = New-Object 'System.Drawing.PointF[]' $n
        for ($i = 0; $i -lt $n; $i++) {
            $c = $ring[$i]
            $pts[$i] = New-Object System.Drawing.PointF((Lng2X([double]$c[0])), (Lat2Y([double]$c[1])))
        }
        $path.StartFigure()
        $path.AddLines($pts)
        $path.CloseFigure()
    }
    $paths.Add($path)
}

Write-Host "Building polygons..."
foreach ($feat in $gj.features) {
    $geom = $feat.geometry
    if ($geom.type -eq "Polygon") {
        Add-Polygon $geom.coordinates
    } elseif ($geom.type -eq "MultiPolygon") {
        foreach ($poly in $geom.coordinates) { Add-Polygon $poly }
    }
}
Write-Host ("Polygons: " + $paths.Count)

# Pass 1: fill land
foreach ($p in $paths) { $g.FillPath($landBrush, $p) }
# Pass 2: stroke sandy coast on top
foreach ($p in $paths) { $g.DrawPath($coastPen, $p) }

$g.Dispose()
$landBrush.Dispose(); $coastPen.Dispose()

Write-Host "Recoloring pixels (Pokemon palette)..."

if (-not ("MapRecolor" -as [type])) {
Add-Type -TypeDefinition @"
public class MapRecolor {
  public static void Run(byte[] b, int stride, int W, int H) {
    // Palette in B,G,R order (Format24bppRgb)
    byte[] OCEAN  = {196,176,47};
    byte[] ICE    = {240,235,210};
    byte[] SAND   = {160,222,235};
    byte[] SNOW   = {248,246,240};
    byte[] GRASSL = {110,205,150};
    byte[] GRASSD = {90,180,110};
    for (int y = 0; y < H; y++) {
      double lat = 90.0 - ((double)y / H) * 180.0;
      double alat = lat < 0 ? -lat : lat;
      int rowOff = y * stride;
      for (int x = 0; x < W; x++) {
        int o = rowOff + x * 3;
        byte bb = b[o], gg = b[o+1], rr = b[o+2];
        byte[] col;
        if (bb > 150 && rr < 100 && gg < 100) {
          col = alat >= 78 ? ICE : OCEAN;          // ocean (polar -> ice)
        } else if (rr > 150 && gg < 100 && bb < 100) {
          col = alat >= 70 ? SNOW : SAND;          // sandy coast (polar -> snow)
        } else {
          if (alat >= 70) {
            col = SNOW;                            // polar land
          } else {
            int h = ((x * 73856093) ^ (y * 19349663)) & 255;
            col = h < 110 ? GRASSD : GRASSL;       // mottled grass
          }
        }
        b[o] = col[0]; b[o+1] = col[1]; b[o+2] = col[2];
      }
    }
  }
}
"@
}

$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

[MapRecolor]::Run($bytes, $stride, $W, $H)

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)

Write-Host "Saving PNG..."
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host ("Done -> " + $outFile)
