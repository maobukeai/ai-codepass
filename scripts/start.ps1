# AI CodePass 一键启动控制中心
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "AI CodePass 启动管理"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# 自动检测与补充 Cargo 环境变量
$cargoPath = "$HOME\.cargo\bin"
if (Test-Path "$cargoPath\cargo.exe") {
    if ($env:PATH -notlike "*$cargoPath*") {
        $env:PATH = "$cargoPath;$env:PATH"
    }
}

function Stop-StaleDevProcesses {
    $ports = @(1420, 1456)
    foreach ($port in $ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $procId = $conn.OwningProcess
            if ($procId -and $procId -gt 0 -and $procId -ne $PID) {
                $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($p) {
                    Write-Host "[端口守护] 发现占用端口 $port 的残留进程 $($p.ProcessName) (PID: $procId)，正在释放..." -ForegroundColor Yellow
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "         🚀 欢迎使用 AI CodePass 一键启动管理工具" -ForegroundColor Cyan
Write-Host "    (CodeBuddy / Qoder / Trae 三合一专属账号管理与自动签到)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请选择运行模式 (直接回车默认启动 [1]):" -ForegroundColor Green
Write-Host "----------------------------------------------------------------"
Write-Host " [1] 启动开发调试模式 (推荐日常使用：热重载桌面客户端)"
Write-Host " [2] 打包编译为 Windows .exe 安装包 (Release 生产版)"
Write-Host " [3] 完整性类型与编译检查 (TypeScript + Rust 双校验)"
Write-Host " [4] 启动 Web 前端服务 (在浏览器中预览)"
Write-Host " [0] 退出"
Write-Host "----------------------------------------------------------------"

$choice = Read-Host "请输入选项编号 [1/2/3/4/0, 默认 1]"
if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "1"
} else {
    $choice = $choice.Trim()
}

switch ($choice) {
    "1" {
        Stop-StaleDevProcesses
        Write-Host "`n[AI CodePass] 正在启动桌面客户端..." -ForegroundColor Cyan
        npm run tauri:dev
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[提示] 客户端进程已退出 (退出码: $LASTEXITCODE)。" -ForegroundColor Yellow
            Read-Host "按回车键关闭窗口"
        }
    }
    "2" {
        Write-Host "`n[AI CodePass] 正在打包生产安装程序 (.exe)..." -ForegroundColor Cyan
        npm run tauri build
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n🎉 打包完成！安装包生成于: src-tauri\target\release\bundle\nsis\" -ForegroundColor Green
            Read-Host "按回车键退出"
        } else {
            Write-Host "`n[提示] 打包过程遇到异常 (退出码: $LASTEXITCODE)。" -ForegroundColor Red
            Read-Host "按回车键关闭窗口"
        }
    }
    "3" {
        Write-Host "`n[1/2] 正在进行 TypeScript 检查..." -ForegroundColor Cyan
        npm run typecheck
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[2/2] 正在进行 Rust 编译检查..." -ForegroundColor Cyan
            cargo check --manifest-path src-tauri/Cargo.toml
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n🎉 检查完成！前端与后端代码 100% 校验通过！" -ForegroundColor Green
                Read-Host "按回车键退出"
            } else {
                Read-Host "Rust 编译检查未通过，按回车键退出"
            }
        } else {
            Read-Host "TypeScript 类型检查未通过，按回车键退出"
        }
    }
    "4" {
        Stop-StaleDevProcesses
        Write-Host "`n正在启动 Web 前端预览..." -ForegroundColor Cyan
        npm run dev
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[提示] Web 服务已退出 (退出码: $LASTEXITCODE)。" -ForegroundColor Yellow
            Read-Host "按回车键关闭窗口"
        }
    }
    "0" {
        exit 0
    }
    Default {
        Stop-StaleDevProcesses
        Write-Host "`n默认启动开发模式..." -ForegroundColor Cyan
        npm run tauri:dev
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[提示] 客户端进程已退出 (退出码: $LASTEXITCODE)。" -ForegroundColor Yellow
            Read-Host "按回车键关闭窗口"
        }
    }
}
