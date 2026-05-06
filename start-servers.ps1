$ErrorActionPreference = "Stop"

# Configuration
$FRONTEND_PORT = 4200
$BACKEND_PORT = 3000
$FRONTEND_DIR = "$PSScriptRoot"
$BACKEND_DIR = "$PSScriptRoot\server" 

function Write-Color {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Kill-PortProcess {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        Write-Color "[*] Found running process on port $Port. Terminating..." -Color "Yellow"
        $unique_pids = $connections | Select-Object -ExpandProperty OwningProcess | Select-Object -Unique
        foreach ($pid_to_kill in $unique_pids) {
            if ($pid_to_kill -ne 0 -and $pid_to_kill -ne $PID) {
                try {
                    Stop-Process -Id $pid_to_kill -Force -ErrorAction SilentlyContinue
                    Write-Color "    -> Killed process PID: $pid_to_kill" -Color "Green"
                } catch {
                    Write-Color "    -> Could not kill $pid_to_kill. You might need Administrator rights." -Color "Red"
                }
            }
        }
        Start-Sleep -Seconds 1
    } else {
        Write-Color "    -> Port $Port is currently free." -Color "DarkGray"
    }
}

Write-Color "============================================================" -Color "Cyan"
Write-Color "         [ STARTING CCD APPLICATION SERVERS ]         " -Color "Magenta"
Write-Color "============================================================" -Color "Cyan"

Write-Color "`n[1/3] Checking ports and cleaning up old processes..." -Color "Blue"
Kill-PortProcess -Port $FRONTEND_PORT
Kill-PortProcess -Port $BACKEND_PORT

Write-Color "`n[2/3] Starting Backend Server..." -Color "Blue"
if (Test-Path $BACKEND_DIR) {
    $argList = "-NoExit -Command `"cd '$BACKEND_DIR'; node server.js`""
    Start-Process -FilePath "powershell" -ArgumentList $argList -WindowStyle Normal
    Write-Color "    -> Backend is starting in a new window on port $BACKEND_PORT." -Color "Green"
} else {
    Write-Color "    -> Backend directory not found at '$BACKEND_DIR'. Skipping backend startup..." -Color "Red"
    Write-Color "    -> (Please update the BACKEND_DIR in this script if it is elsewhere)" -Color "DarkGray"
}

Write-Color "`n[3/3] Starting Frontend Server..." -Color "Blue"
if (Test-Path $FRONTEND_DIR) {
    # Using -- --host 0.0.0.0 to tell Angular to bind to external IPs
    $argList = "-NoExit -Command `"cd '$FRONTEND_DIR'; npm start -- --host 0.0.0.0`""
    Start-Process -FilePath "powershell" -ArgumentList $argList -WindowStyle Normal
    Write-Color "    -> Frontend is starting in a new window on port $FRONTEND_PORT." -Color "Green"
} else {
    Write-Color "    -> Frontend directory not found. Skipping..." -Color "Red"
}

Write-Color "`n============================================================" -Color "Cyan"
Write-Color " [*] Servers are spinning up! Preparing local network...    " -Color "Magenta"
Write-Color "============================================================" -Color "Cyan"

Write-Color "`nShare these IP addresses with your colleagues on the local network:" -Color "Yellow"

# Get active IPv4 addresses (excluding Loopback, VPNs, Hyper-V virtual adapters if possible)
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.InterfaceAlias -notmatch "(Loopback|vEthernet|Pseudo|Tailscale|ZeroTier)" 
}

Write-Color "`n--- [ Web App (Frontend) URLs ] ---" -Color "Cyan"
if ($ips) {
    foreach ($ip in $ips) {
        Write-Color "  * http://$($ip.IPAddress):$FRONTEND_PORT  ($($ip.InterfaceAlias))" -Color "Green"
    }
    Write-Color "  * http://localhost:$FRONTEND_PORT  (Local)" -Color "DarkGray"
} else {
    Write-Color "    Could not detect external network interface." -Color "Red"
}

Write-Color "`n--- [ API (Backend) URLs ] ---" -Color "Cyan"
if ($ips) {
    foreach ($ip in $ips) {
        Write-Color "  * http://$($ip.IPAddress):$BACKEND_PORT  ($($ip.InterfaceAlias))" -Color "Green"
    }
    Write-Color "  * http://localhost:$BACKEND_PORT  (Local)" -Color "DarkGray"
}

Write-Color "`n============================================================" -Color "Cyan"
Write-Color "Note: You can run this script any time. It will automatically" -Color "DarkGray"
Write-Color "kill the old instances before starting new ones!" -Color "DarkGray"