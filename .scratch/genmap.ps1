Add-Type -AssemblyName System.Drawing

# =====================================================================
#  PokeGlobe map generator  ──  REAL geography, Pokemon flat-art style.
#  Land/ocean/coast come from Natural Earth 50m vectors (crisp coastline).
#  Biome color is derived from REAL raster data and quantized to a flat
#  Pokemon palette:
#    - NE2_50M_SR_W.tif  -> natural land-cover color (desert/forest/ice)
#    - HYP_50M_SR_W.tif   -> hypsometric elevation tint (mountain ranges)
#  Requires (in .scratch/): land50.geojson, lakes50.geojson,
#  NE2_50M_SR_W.tif, HYP_50M_SR_W.tif
# =====================================================================

$W = 2048
$H = 1024
$root = "C:\Users\ASUS\Desktop\viajandoporelmundo"
$sc   = Join-Path $root ".scratch"
$landFile = Join-Path $sc "land50.geojson"
$lakeFile = Join-Path $sc "lakes50.geojson"
$ne2File  = Join-Path $sc "NE2_50M_SR_W.tif"
$hypFile  = Join-Path $sc "HYP_50M_SR_W.tif"
$outFile  = Join-Path $root "public\pokemon-map.png"

# -------- marker colors used while rasterizing the land mask ----------
$cOcean = [System.Drawing.Color]::FromArgb(0,0,255)    # blue
$cLand  = [System.Drawing.Color]::FromArgb(0,255,0)    # green
$cCoast = [System.Drawing.Color]::FromArgb(255,0,0)    # red

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.Clear($cOcean)

$landBrush = New-Object System.Drawing.SolidBrush($cLand)
$oceanBrush = New-Object System.Drawing.SolidBrush($cOcean)
$coastPen = New-Object System.Drawing.Pen($cCoast, 2.0)

function Lng2X([double]$lng) { return [float]((($lng + 180.0) / 360.0) * $W) }
function Lat2Y([double]$lat) { return [float]((( 90.0 - $lat) / 180.0) * $H) }

function Build-Paths($file) {
    $list = New-Object System.Collections.Generic.List[System.Drawing.Drawing2D.GraphicsPath]
    $gj = Get-Content $file -Raw | ConvertFrom-Json
    function Add-Poly($rings, $sink) {
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
            $path.StartFigure(); $path.AddLines($pts); $path.CloseFigure()
        }
        $sink.Add($path)
    }
    foreach ($feat in $gj.features) {
        $geom = $feat.geometry
        if ($geom.type -eq "Polygon") { Add-Poly $geom.coordinates $list }
        elseif ($geom.type -eq "MultiPolygon") { foreach ($poly in $geom.coordinates) { Add-Poly $poly $list } }
    }
    return ,$list
}

Write-Host "Rasterizing land mask..."
$landPaths = Build-Paths $landFile
foreach ($p in $landPaths) { $g.FillPath($landBrush, $p) }

if (Test-Path $lakeFile) {
    Write-Host "Punching lakes as ocean..."
    $lakePaths = Build-Paths $lakeFile
    foreach ($p in $lakePaths) { $g.FillPath($oceanBrush, $p) }
}

Write-Host "Stroking sandy coast..."
foreach ($p in $landPaths) { $g.DrawPath($coastPen, $p) }
$g.Dispose(); $landBrush.Dispose(); $oceanBrush.Dispose(); $coastPen.Dispose()

# ---- downsample a big raster to WxH into a 24bpp byte array ----------
function Get-Downsampled($file) {
    $src = New-Object System.Drawing.Bitmap($file)
    $dst = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $dg = [System.Drawing.Graphics]::FromImage($dst)
    $dg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $dg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $dg.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$W,$H)))
    $dg.Dispose(); $src.Dispose()
    $rect = New-Object System.Drawing.Rectangle(0,0,$W,$H)
    $d = $dst.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $stride = $d.Stride
    $buf = New-Object byte[] ($stride * $H)
    [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $buf, 0, $buf.Length)
    $dst.UnlockBits($d); $dst.Dispose()
    return @{ bytes = $buf; stride = $stride }
}

Write-Host "Downsampling NE2 (land cover)..."
$ne2 = Get-Downsampled $ne2File
Write-Host "Downsampling HYP (elevation)..."
$hyp = Get-Downsampled $hypFile

Write-Host "Classifying biomes (Pokemon palette)..."
if (-not ("MapBiome" -as [type])) {
Add-Type -TypeDefinition @"
public class MapBiome {
  static int Mx(int a,int b,int c){ int m=a>b?a:b; return m>c?m:c; }
  static int Mn(int a,int b,int c){ int m=a<b?a:b; return m<c?m:c; }
  public static void Run(byte[] o, byte[] ne, byte[] hy, int stride, int W, int H) {
    // palette, B,G,R order (Format24bppRgb)
    byte[] OCEAN  = {196,176,47};
    byte[] ICE    = {240,235,210};
    byte[] BEACH  = {150,214,236};
    byte[] SNOW   = {248,246,244};
    byte[] GRASSL = {110,205,150};
    byte[] GRASSD = {95,185,120};
    byte[] JUNGL  = {85,155,70};
    byte[] JUNGD  = {70,130,52};
    byte[] SAVAL  = {120,198,206};
    byte[] SAVAD  = {104,182,190};
    byte[] DESEL  = {150,214,240};
    byte[] DESED  = {132,196,224};
    byte[] TUNDL  = {198,208,200};
    byte[] TUNDD  = {184,192,182};
    byte[] TAIGL  = {112,150,86};
    byte[] TAIGD  = {96,126,66};
    byte[] MOUNL  = {128,150,162};
    byte[] MOUND  = {100,116,128};
    for (int y = 0; y < H; y++) {
      double lat = 90.0 - ((double)y / H) * 180.0;
      double alat = lat < 0 ? -lat : lat;
      int row = y * stride;
      for (int x = 0; x < W; x++) {
        int o3 = row + x * 3;
        int h = ((x*73856093) ^ (y*19349663)) & 255;
        bool dark = h < 120;
        double jit = (((h >> 2) & 31) - 15) * 0.45;   // ~+-7deg noise to break straight lines
        byte mb = o[o3], mg = o[o3+1], mr = o[o3+2];
        byte[] col;
        // ----- ocean from marker -----
        if (mb > 150 && mr < 100 && mg < 100) {
          col = (alat + jit) >= 78 ? ICE : OCEAN;
        }
        // ----- sandy coast ring from marker -----
        else if (mr > 150 && mg < 100 && mb < 100) {
          col = (alat + jit) >= 69 ? SNOW : BEACH;
        }
        // ----- land: classify biome from real rasters -----
        else {
          int nr = ne[o3+2], ng = ne[o3+1], nb = ne[o3];
          int hr = hy[o3+2], hg = hy[o3+1], hb = hy[o3];
          int warmth = nr - nb;
          int nmx = Mx(nr,ng,nb), nmn = Mn(nr,ng,nb);
          int greenN = ng - (nr > nb ? nr : nb);
          int hWarm = hr - hg;
          int hmn = Mn(hr,hg,hb);

          int biome; // 0 snow,1 desert,2 savanna,3 jungle,4 grass,5 tundra,6 taiga,7 mountain
          if (alat + jit >= 73)                        biome = 0;        // polar -> snow
          else if (nmn >= 206 && warmth <= 14)          biome = 0;        // ice/snow (neutral bright)
          else if (warmth >= 30 && (nr-ng) >= 10)       biome = 1;        // desert (warm, red>green)
          else if (warmth >= 24 && greenN < 6)          biome = 2;        // savanna / dry steppe
          else if (greenN >= 22 && nmx < 200)           biome = 3;        // rainforest / jungle
          else if (greenN >= 5)                         biome = 4;        // temperate green
          else                                          biome = 5;        // pale neutral -> tundra

          // mountain override from elevation (skip dry biomes & poles)
          if (biome != 1 && biome != 2) {
            bool hypHigh = (hmn >= 210);               // bright -> high peaks
            bool hypMtn  = (hWarm >= 12 && (hg-hr) <= 4); // brown -> rocky mountain
            if (hypHigh && alat < 66)      biome = 0;  // snow-capped peak
            else if (hypMtn)               biome = 7;  // rocky mountain
          }
          // boreal: temperate green at high latitude -> taiga (jittered, ~55deg)
          if (biome == 4 && (alat + jit) >= 55)   biome = 6;

          switch (biome) {
            case 0: col = SNOW; break;
            case 1: col = dark ? DESED : DESEL; break;
            case 2: col = dark ? SAVAD : SAVAL; break;
            case 3: col = dark ? JUNGD : JUNGL; break;
            case 4: col = dark ? GRASSD : GRASSL; break;
            case 5: col = dark ? TUNDD : TUNDL; break;
            case 6: col = dark ? TAIGD : TAIGL; break;
            default: col = dark ? MOUND : MOUNL; break;
          }
        }
        o[o3] = col[0]; o[o3+1] = col[1]; o[o3+2] = col[2];
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

[MapBiome]::Run($bytes, $ne2.bytes, $hyp.bytes, $stride, $W, $H)

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)

Write-Host "Saving PNG..."
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host ("Done -> " + $outFile)
