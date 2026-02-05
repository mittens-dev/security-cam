# 🔧 SSH Development Setup Guide

This guide covers setting up SSH access from your main PC/Mac to the Raspberry Pi for comfortable development work.

## Prerequisites

- Raspberry Pi with the security camera system installed and running
- SSH server enabled on the Raspberry Pi (usually enabled by default)
- Network connectivity between your PC and Raspberry Pi

## 1. Find Your Raspberry Pi's IP Address

### On the Raspberry Pi (terminal):
```bash
hostname -I
```

**Example output:** `192.168.4.175`

Or check your router's connected devices list.

## 2. Enable SSH on Raspberry Pi (if not already enabled)

### Option A: Using raspi-config (easiest)
```bash
sudo raspi-config
```
Navigate to: `Interface Options` → `SSH` → Select `Enable`

### Option B: Via command line
```bash
sudo systemctl enable ssh
sudo systemctl start ssh
```

## 3. Test SSH Connection from Your PC

### On your main PC/Mac (terminal):
```bash
ssh pi@192.168.4.175
```

Replace `192.168.4.175` with your actual Pi IP address.

**First connection:** You'll be asked to confirm the fingerprint (type `yes`)

Enter the password when prompted (default is usually `raspberry`)

If successful, you should see a Linux terminal prompt: `pi@camcon:~ $`

## 4. Set Up SSH Key Authentication (Recommended)

This allows passwordless SSH connections - much more convenient for development.

### Step 1: Generate SSH key on your PC (if you don't have one)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C "your-email@example.com"
```

Or use RSA if your system doesn't support Ed25519:
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -C "your-email@example.com"
```

Press Enter twice (no passphrase for development convenience, or add one if you prefer)

### Step 2: Copy public key to Raspberry Pi

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub pi@192.168.4.175
```

Or for RSA:
```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub pi@192.168.4.175
```

Enter your password once more.

### Step 3: Test passwordless SSH

```bash
ssh pi@192.168.4.175
```

You should now connect **without** entering a password!

## 5. Configure SSH Config for Easier Connections

Create/edit `~/.ssh/config` on your main PC to simplify SSH commands:

```bash
nano ~/.ssh/config
```

Add this section:

```
Host camcon
    HostName 192.168.4.175
    User pi
    IdentityFile ~/.ssh/id_ed25519
    Port 22
```

Now you can simply connect with:
```bash
ssh camcon
```

## 6. Set Up VS Code Remote Development (Optional but Recommended)

With VS Code's Remote - SSH extension, you can edit files directly on the Pi in VS Code.

### Step 1: Install VS Code Extension

Open VS Code and install: **"Remote - SSH"** by Microsoft

### Step 2: Connect to Raspberry Pi

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type: `Remote-SSH: Connect to Host...`
3. Select or type: `camcon` (or `pi@192.168.4.175`)
4. Select your OS (Linux)
5. VS Code will connect and install remote server

### Step 3: Open Project Folder

Once connected:
1. Click File → Open Folder
2. Navigate to: `/home/pi/dev/security-cam`
3. Click OK

Now you can:
- Edit files in the web interface directly on the Pi
- See live file changes reflected on the system
- Use VS Code's integrated terminal for running commands
- Install VS Code extensions for Python/JavaScript development

## 7. Copy Local Project to Pi (If Starting Fresh)

If you want to work on the same codebase locally and push changes:

### Sync from your PC to Pi:
```bash
rsync -avz --delete /path/to/local/security-cam/ pi@camcon:/home/pi/dev/security-cam/
```

### Sync from Pi to your PC:
```bash
rsync -avz --delete pi@camcon:/home/pi/dev/security-cam/ /path/to/local/security-cam/
```

## 8. Run Python Development Server

For faster iteration during development, you can run the API without systemd:

```bash
ssh pi@camcon

# Stop the service
sudo systemctl stop security-cam

# Navigate to project
cd /home/pi/dev/security-cam

# Activate venv
source venv/bin/activate

# Install dev dependencies
pip install -r requirements.txt

# Run Flask in debug mode
cd api
FLASK_ENV=development FLASK_DEBUG=1 python3 security-api.py
```

The API will reload automatically when you save file changes!

**To restart the service afterward:**
```bash
sudo systemctl start security-cam
```

## 9. Useful Development Commands

### View logs in real-time:
```bash
ssh camcon 'sudo journalctl -u security-cam -f'
```

### Quick restart of service:
```bash
ssh camcon 'sudo systemctl restart security-cam'
```

### Check service status:
```bash
ssh camcon 'sudo systemctl status security-cam --no-pager'
```

### Push code changes from Pi:
```bash
ssh camcon 'cd /home/pi/dev/security-cam && git add -A && git commit -m "message" && git push'
```

## 10. Troubleshooting

### "Connection refused"
- Check if SSH is running: `sudo systemctl status ssh`
- Check if firewall is blocking: `sudo ufw allow 22` (if using ufw)

### "Permission denied (publickey)"
- Re-run: `ssh-copy-id -i ~/.ssh/id_ed25519.pub pi@192.168.4.175`
- Ensure keys have correct permissions: `chmod 700 ~/.ssh` and `chmod 600 ~/.ssh/id_*`

### "Cannot connect to host" / IP address not working
- Get fresh IP: `ssh pi@<new-ip>`
- Check Pi is on network: `ping 192.168.4.175`

### Slow SSH connection
- Disable DNS lookups in SSH config:
  ```
  Host camcon
      ...
      UseDNS no
  ```

## 11. Secure Your Pi (Optional)

### Change default password:
```bash
ssh camcon
passwd
```

### Disable password authentication (after SSH keys work):
```bash
ssh camcon 'sudo nano /etc/ssh/sshd_config'
```

Find and change:
```
PasswordAuthentication no
```

Restart SSH:
```bash
ssh camcon 'sudo systemctl restart ssh'
```

## Quick Reference

| Task | Command |
|------|---------|
| Connect to Pi | `ssh camcon` |
| Open in VS Code | `Ctrl+Shift+P` → `Remote-SSH: Connect` |
| View live logs | `ssh camcon 'sudo journalctl -u security-cam -f'` |
| Restart service | `ssh camcon 'sudo systemctl restart security-cam'` |
| Stop service | `ssh camcon 'sudo systemctl stop security-cam'` |
| Run dev server | `ssh camcon 'cd /home/pi/dev/security-cam/api && python3 security-api.py'` |
| Sync files | `rsync -avz pi@camcon:/home/pi/dev/security-cam/ ./` |

## Next Steps

- Configure your favorite editor/IDE for remote development
- Set up git hooks for auto-deployment
- Consider setting up automatic backups of recordings
- Look into port forwarding if you need remote access over the internet
