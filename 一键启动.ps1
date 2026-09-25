# AI CodePass - PowerShell 一键启动管理脚本
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "AI CodePass - 一键启动管理"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# 1. 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未检测到 Node.js 环境！" -ForegroundColor Red
    Write-Host "请先安装 Node.js (推荐 v18+): https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

# 2. 检查并补充 Rust/Cargo
$cargoPath = "$HOME\.cargo\bin"
if (Test-Path "$cargoPath\cargo.exe") {
    if ($env:PATH -notlike "*$cargoPath*") {
        $env:PATH = "$cargoPath;$env:PATH"
    }
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "[警告] 未在环境变量中检测到 Rust / Cargo！" -ForegroundColor Yellow
    Write-Host "如果未安装 Rust，请前往官网安装: https://rustup.rs/" -ForegroundColor Yellow
}

# 3. 检查依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "[提示] 正在为您自动安装前端依赖 (npm install)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败，请检查网络！" -ForegroundColor Red
        Read-Host "按回车退出"
        exit 1
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
Write-Host "         🚀 欢迎使用 AI CodePass 一键启动管理脚本" -ForegroundColor Cyan
Write-Host "    (CodeBuddy / Qoder / Trae 三合一专属账号管理与自动签到工具)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 4. 菜单交互
Write-Host "请选择运行模式 (直接回车默认启动 [1]):" -ForegroundColor Green
Write-Host "----------------------------------------------------------------"
Write-Host " [1] 启动开发调试模式 (推荐：启动桌面客户端，带热重载与界面预览)"
Write-Host " [2] 打包编译为 Windows .exe 安装程序 (Release 生产安装包)"
Write-Host " [3] 仅进行完整性与类型检查 (TypeScript 检查 + Rust 检查)"
Write-Host " [4] 仅启动 Web 纯前端调试服务 (在浏览器中预览)"
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
        Write-Host "`n正在启动 AI CodePass 桌面客户端..." -ForegroundColor Cyan
        npm run tauri:dev
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[提示] 客户端进程已退出 (退出码: $LASTEXITCODE)。" -ForegroundColor Yellow
            Read-Host "按回车键关闭窗口"
        }
    }
    "2" {
        Write-Host "`n正在为 Windows 平台打包生产安装程序..." -ForegroundColor Cyan
        npm run tauri build
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n🎉 打包完成！安装程序已生成于: src-tauri\target\release\bundle\nsis\" -ForegroundColor Green
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
        Write-Host "`n正在启动纯前端 Web 预览服务..." -ForegroundColor Cyan
        npm run dev
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[提示] 前端服务已退出 (退出码: $LASTEXITCODE)。" -ForegroundColor Yellow
            Read-Host "按回车键关闭窗口"
        }
    }
    "0" {
        Write-Host "已退出。" -ForegroundColor Gray
        exit 0
    }
    Default {
        Stop-StaleDevProcesses
        Write-Host "`n输入无效，默认启动开发模式..." -ForegroundColor Cyan
        npm run tauri:dev
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[提示] 客户端进程已退出 (退出码: $LASTEXITCODE)。" -ForegroundColor Yellow
            Read-Host "按回车键关闭窗口"
        }
    }
}
