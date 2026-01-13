// 🚀 COMPLETE REAL-TIME IOT DASHBOARD
class SensorMonitor {
    constructor() {
        // YOUR Codespace URLs
        this.ingestionUrl = 'https://legendary-pancake-5g46rv44pwpvfvjg9-5000.app.github.dev';
        this.alertsUrl = 'https://legendary-pancake-5g46rv44pwpvfvjg9-5001.app.github.dev';
        this.pollInterval = 1000; // 1s silky smooth
        
        this.sensorHistory = { temperature: [], pressure: [] };
        this.maxHistory = 60; // 1 minute
        
        console.log('🌐 Starting Real-Time Monitor...');
        this.initUI();
        this.startRealtime();
    }

    initUI() {
        this.tempValueEl = document.getElementById('temp-value');
        this.pressureValueEl = document.getElementById('pressure-value');
        this.tempStatusEl = document.getElementById('temp-status');
        this.pressureStatusEl = document.getElementById('pressure-status');
        this.heatValveEl = document.getElementById('heat-valve-status');
        this.coolValveEl = document.getElementById('cool-valve-status');
        this.pressureInValveEl = document.getElementById('pressure-in-valve-status');
        this.pressureOutValveEl = document.getElementById('pressure-out-valve-status');
        this.alertsListEl = document.getElementById('alerts-list');
        this.connectionStatusEl = document.getElementById('connection-status');
        this.tempChartEl = document.getElementById('temp-chart');
        this.pressureChartEl = document.getElementById('pressure-chart');
    }

    updateSparkline(canvas, data, color) {
        if (!canvas || !data.length) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = 60;
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.beginPath();
        
        if (data.length < 2) return;
        const values = data.map(d => d.value).filter(v => v != null);
        if (!values.length) return;
        
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min || 1;
        
        data.forEach((point, i) => {
            if (point.value == null) return;
            const x = (i / (data.length - 1)) * (width - 20) + 10;
            const y = height - 10 - ((point.value - min) / range) * (height - 20);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    updateDisplay(status) {
        if (!status) return;
        this.setConnectionStatus(true);

        // 🌡️ TEMPERATURE
        if (status.Temperature && this.tempValueEl) {
            const temp = status.Temperature;
            this.tempValueEl.textContent = `${temp.value?.toFixed(1) || 'N/A'} °C`;
            if (this.tempStatusEl) {
                this.tempStatusEl.textContent = temp.status || 'UNKNOWN';
                this.tempStatusEl.className = `status ${temp.status === 'OK' ? 'online' : 'offline'}`;
            }
            if (this.tempChartEl && temp.value != null) {
                this.sensorHistory.temperature.push({ value: temp.value, time: Date.now() });
                if (this.sensorHistory.temperature.length > this.maxHistory) {
                    this.sensorHistory.temperature.shift();
                }
                this.updateSparkline(this.tempChartEl, this.sensorHistory.temperature, '#ff6b35');
            }
        }

        // 📊 PRESSURE
        if (status.Pressure && this.pressureValueEl) {
            const pressure = status.Pressure;
            this.pressureValueEl.textContent = `${pressure.value?.toFixed(1) || 'N/A'} bar`;
            if (this.pressureStatusEl) {
                this.pressureStatusEl.textContent = pressure.status || 'UNKNOWN';
                this.pressureStatusEl.className = `status ${pressure.status === 'OK' ? 'online' : 'offline'}`;
            }
            if (this.pressureChartEl && pressure.value != null) {
                this.sensorHistory.pressure.push({ value: pressure.value, time: Date.now() });
                if (this.sensorHistory.pressure.length > this.maxHistory) {
                    this.sensorHistory.pressure.shift();
                }
                this.updateSparkline(this.pressureChartEl, this.sensorHistory.pressure, '#4ecdc4');
            }
        }

        // Valves
        const valveMapping = {
            'heat_valve': this.heatValveEl,
            'cool_valve': this.coolValveEl,
            'pressureIn_valve': this.pressureInValveEl,
            'pressureOut_valve': this.pressureOutValveEl
        };
        Object.entries(valveMapping).forEach(([name, el]) => {
            if (status[name] !== undefined && el) {
                const isOpen = status[name] === 'OPEN';
                el.textContent = isOpen ? '🟢 OPEN' : '🔴 CLOSED';
                el.className = `valve-status ${isOpen ? 'open' : 'closed'}`;
            }
        });
    }

    async updateAlerts() {
        try {
            const response = await fetch(`${this.alertsUrl}/alerts`);
            if (!response.ok) return;
            const alerts = await response.json();
            if (!this.alertsListEl) return;
            
            this.alertsListEl.innerHTML = '';
            alerts.slice(-5).reverse().forEach(alert => {
                const div = document.createElement('div');
                div.className = 'alert-item';
                const timeAgo = this.timeAgo(new Date(alert.timestamp));
                div.innerHTML = `
                    <div style="font-weight: 600; color: #2c3e50;">${alert.message}</div>
                    <div style="color: #6c757d; font-size: 0.9em;">${timeAgo}</div>
                `;
                this.alertsListEl.appendChild(div);
            });
        } catch (e) { console.error('Alerts:', e); }
    }

    timeAgo(date) {
        const diff = Date.now() - date;
        const sec = Math.floor(diff / 1000);
        return sec < 60 ? `${sec}s ago` : `${Math.floor(sec/60)}m ago`;
    }

    setConnectionStatus(connected) {
        if (!this.connectionStatusEl) return;
        this.connectionStatusEl.textContent = connected ? '🟢 LIVE' : '🔴 DISCONNECTED';
        this.connectionStatusEl.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }

    async fetchStatus() {
        try {
            const res = await fetch(`${this.ingestionUrl}/status`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error('Status:', e.message);
            return null;
        }
    }

    startRealtime() {
        setInterval(async () => {
            const status = await this.fetchStatus();
            this.updateDisplay(status);
            this.updateAlerts();
        }, this.pollInterval);

        this.fetchStatus().then(status => {
            this.updateDisplay(status);
            this.updateAlerts();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new SensorMonitor());
