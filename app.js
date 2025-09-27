document.addEventListener('DOMContentLoaded', () => {
    // 状態管理
    let currentDate = new Date();
    let selectedDate = null;
    let db = {
        periods: [], // { startDate, endDate }
        spotting: [], // { date }
        temperatures: [], // { date, temp }
        symptoms: [], // { date, items: ['headache', 'cramps'] }
        notes: [] // { date, text }
    };
    let tempChart = null;

    // 利用可能な症状リスト
    const availableSymptoms = {
        'cramps': '腹痛', 'headache': '頭痛', 'fatigue': '倦怠感', 
        'bloating': 'お腹の張り', 'nausea': '吐き気', 'dizziness': 'めまい',
        'anxiety': '不安', 'irritability': 'イライラ', 'sadness': '気分の落ち込み'
    };
    
    // DOM要素
    const monthYearEl = document.getElementById('current-month-year');
    const calendarGridEl = document.getElementById('calendar-grid');
    const modal = document.getElementById('modal');
    const closeModalButton = document.querySelector('.close-button');
    const modalDateEl = document.getElementById('modal-date');
    const saveDataButton = document.getElementById('save-data');
    const shareDataButton = document.getElementById('share-data');
    
    const nextPeriodDateEl = document.getElementById('next-period-date');
    const nextOvulationDateEl = document.getElementById('next-ovulation-date');
    const avgCycleLengthEl = document.getElementById('avg-cycle-length');

    const init = () => {
        loadData();
        render();
        registerServiceWorker();
        addEventListeners();
    };

    const render = () => {
        renderCalendar();
        updatePredictions();
        renderTempChart();
    }

    const saveData = () => {
        localStorage.setItem('cycleTrackerData', JSON.stringify(db));
    };

    const loadData = () => {
        const data = localStorage.getItem('cycleTrackerData');
        if (data) {
            const parsedData = JSON.parse(data);
            db.periods = parsedData.periods || [];
            db.spotting = parsedData.spotting || [];
            db.temperatures = parsedData.temperatures || [];
            db.symptoms = parsedData.symptoms || [];
            db.notes = parsedData.notes || [];
        }
    };

    const renderCalendar = () => {
        calendarGridEl.innerHTML = '';
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        monthYearEl.textContent = `${year}年 ${month + 1}月`;
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
        const lastDateOfPrevMonth = new Date(year, month, 0).getDate();
        
        const { fertileWindow, ovulationDate } = getPredictions();

        // 前月の日付
        for (let i = firstDayOfMonth; i > 0; i--) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day not-current-month';
            dayEl.textContent = lastDateOfPrevMonth - i + 1;
            calendarGridEl.appendChild(dayEl);
        }

        // 今月の日付
        for (let i = 1; i <= lastDateOfMonth; i++) {
            const dayEl = document.createElement('div');
            const date = new Date(year, month, i);
            const dateStr = toDateString(date);

            dayEl.className = 'calendar-day';
            dayEl.dataset.date = dateStr;

            const dayNumber = document.createElement('span');
            dayNumber.className = 'day-number';
            dayNumber.textContent = i;
            dayEl.appendChild(dayNumber);

            if (toDateString(new Date()) === dateStr) {
                dayEl.classList.add('today');
            }

            if (isPeriodDay(dateStr)) dayEl.classList.add('period');
            if (fertileWindow.includes(dateStr)) dayEl.classList.add('fertile');
            if (ovulationDate === dateStr) dayEl.classList.add('ovulation');

            const indicatorsEl = document.createElement('div');
            indicatorsEl.className = 'day-indicators';
            if (db.spotting.some(s => s.date === dateStr)) indicatorsEl.innerHTML += '<div class="indicator spotting-indicator"></div>';
            if (db.temperatures.some(t => t.date === dateStr && t.temp)) indicatorsEl.innerHTML += '<div class="indicator temp-indicator"></div>';
            if (db.symptoms.some(s => s.date === dateStr && s.items.length > 0)) indicatorsEl.innerHTML += '<div class="indicator symptom-indicator"></div>';
            if (db.notes.some(n => n.date === dateStr && n.text)) indicatorsEl.innerHTML += '<div class="indicator note-indicator"></div>';
            dayEl.appendChild(indicatorsEl);

            dayEl.addEventListener('click', () => openModal(dateStr));
            calendarGridEl.appendChild(dayEl);
        }

        // 次月の日付
        const totalDays = firstDayOfMonth + lastDateOfMonth;
        const nextMonthDays = (7 - (totalDays % 7)) % 7;
        for (let i = 1; i <= nextMonthDays; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day not-current-month';
            dayEl.textContent = i;
            calendarGridEl.appendChild(dayEl);
        }
    };
    
    const isPeriodDay = (dateStr) => {
        return db.periods.some(p => {
            const start = p.startDate;
            const end = p.endDate || start;
            return dateStr >= start && dateStr <= end;
        });
    };

    const calculateAvgCycleLength = () => {
        if (db.periods.length < 2) return 28;
        
        const sortedStarts = [...new Set(db.periods.map(p => p.startDate))].sort();
        if (sortedStarts.length < 2) return 28;

        const cycleLengths = [];
        for (let i = 1; i < sortedStarts.length; i++) {
            const prev = new Date(sortedStarts[i-1]);
            const curr = new Date(sortedStarts[i]);
            const diffTime = Math.abs(curr - prev);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 10 && diffDays < 60) { // 極端な値をフィルタリング
                cycleLengths.push(diffDays);
            }
        }

        if (cycleLengths.length === 0) return 28;
        const sum = cycleLengths.reduce((a, b) => a + b, 0);
        return Math.round(sum / cycleLengths.length);
    };

    const getPredictions = () => {
        if (db.periods.length === 0) return { nextPeriodDate: null, ovulationDate: null, fertileWindow: [] };

        const avgCycle = calculateAvgCycleLength();
        const lastPeriodStart = [...db.periods].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0].startDate;
        
        const lastStartDate = new Date(lastPeriodStart);
        const nextPeriodDate = new Date(lastStartDate);
        nextPeriodDate.setDate(lastStartDate.getDate() + avgCycle);
        
        const ovulationDate = new Date(nextPeriodDate);
        ovulationDate.setDate(nextPeriodDate.getDate() - 14);

        const fertileWindow = [];
        for (let i = -5; i <= 1; i++) {
            const fertileDay = new Date(ovulationDate);
            fertileDay.setDate(ovulationDate.getDate() + i);
            fertileWindow.push(toDateString(fertileDay));
        }

        return {
            nextPeriodDate: toDateString(nextPeriodDate),
            ovulationDate: toDateString(ovulationDate),
            fertileWindow
        };
    };

    const updatePredictions = () => {
        const avgCycle = calculateAvgCycleLength();
        const { nextPeriodDate, ovulationDate } = getPredictions();

        avgCycleLengthEl.textContent = db.periods.length > 1 ? avgCycle : 'データ不足';
        nextPeriodDateEl.textContent = nextPeriodDate ? formatDate(nextPeriodDate) : 'データ不足';
        nextOvulationDateEl.textContent = ovulationDate ? formatDate(ovulationDate) : 'データ不足';
    };

    const openModal = (dateStr) => {
        selectedDate = dateStr;
        modalDateEl.textContent = formatDate(dateStr);
        
        document.getElementById('temperature-input').value = db.temperatures.find(t => t.date === dateStr)?.temp || '';
        document.getElementById('note-input').value = db.notes.find(n => n.date === dateStr)?.text || '';
        
        const symptomsContainer = document.getElementById('symptoms-checkboxes');
        symptomsContainer.innerHTML = '';
        const savedSymptoms = db.symptoms.find(s => s.date === dateStr)?.items || [];

        for (const [key, value] of Object.entries(availableSymptoms)) {
            const label = document.createElement('label');
            label.className = 'symptom-label';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = key;
            checkbox.checked = savedSymptoms.includes(key);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(value));
            symptomsContainer.appendChild(label);
        }

        modal.classList.add('show');
    };

    const closeModal = () => {
        modal.classList.remove('show');
        selectedDate = null;
    };
    
    const handleSaveData = () => {
        if (!selectedDate) return;
        const temp = document.getElementById('temperature-input').value;
        updateDB('temperatures', { date: selectedDate, temp: temp ? parseFloat(temp) : null }, 'date', !!temp);
        
        const symptoms = Array.from(document.querySelectorAll('#symptoms-checkboxes input:checked')).map(cb => cb.value);
        updateDB('symptoms', { date: selectedDate, items: symptoms }, 'date', symptoms.length > 0);

        const note = document.getElementById('note-input').value.trim();
        updateDB('notes', { date: selectedDate, text: note }, 'date', !!note);
        
        saveData();
        render();
        closeModal();
    };

    const addEventListeners = () => {
        closeModalButton.addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });
        saveDataButton.addEventListener('click', handleSaveData);
        shareDataButton.addEventListener('click', handleShareData);

        document.getElementById('log-period-start').addEventListener('click', () => {
            if (isPeriodDay(selectedDate)) return;
            const ongoingPeriod = db.periods.find(p => !p.endDate);
            if (ongoingPeriod) {
                ongoingPeriod.endDate = toDateString(new Date(new Date(selectedDate).getTime() - 86400000));
            }
            db.periods.push({ startDate: selectedDate, endDate: null });
            saveAndRender();
        });

        document.getElementById('log-period-end').addEventListener('click', () => {
            const ongoingPeriod = db.periods.find(p => !p.endDate);
            if (ongoingPeriod && selectedDate >= ongoingPeriod.startDate) {
                ongoingPeriod.endDate = selectedDate;
                saveAndRender();
            }
        });

        document.getElementById('log-spotting').addEventListener('click', () => {
            updateDB('spotting', { date: selectedDate }, 'date', true);
            saveAndRender();
        });

        document.getElementById('clear-period').addEventListener('click', () => {
            db.periods = db.periods.filter(p => !(selectedDate >= p.startDate && selectedDate <= (p.endDate || p.startDate)));
            db.spotting = db.spotting.filter(s => s.date !== selectedDate);
            saveAndRender();
        });

        document.getElementById('prev-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
        document.getElementById('next-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });

        document.getElementById('export-data').addEventListener('click', () => {
            const dataStr = JSON.stringify(db, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `cycle-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
        
        document.getElementById('import-file').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (confirm('現在のデータを上書きしてインポートしますか？この操作は元に戻せません。')) {
                        db = importedData;
                        saveData();
                        render();
                        alert('データをインポートしました。');
                    }
                } catch (error) {
                    alert('ファイルの読み込みに失敗しました。');
                }
            };
            reader.readAsText(file);
        });
    };
    
    const handleShareData = () => {
        if (!selectedDate) return;
        const dateStr = formatDate(selectedDate);
        let shareText = `【${dateStr}の記録】\n`;
    
        if (isPeriodDay(selectedDate)) shareText += "・生理中\n";
        if (db.spotting.some(s => s.date === selectedDate)) shareText += "・不正出血あり\n";
        
        const tempData = db.temperatures.find(t => t.date === selectedDate);
        if (tempData && tempData.temp) shareText += `・基礎体温: ${tempData.temp} °C\n`;
    
        const symptomsData = db.symptoms.find(s => s.date === selectedDate);
        if (symptomsData && symptomsData.items.length > 0) {
            const symptomNames = symptomsData.items.map(key => availableSymptoms[key] || key);
            shareText += `・症状: ${symptomNames.join(', ')}\n`;
        }
    
        const noteData = db.notes.find(n => n.date === selectedDate);
        if (noteData && noteData.text) shareText += `・メモ:\n${noteData.text}\n`;
    
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareText.trim())
                .then(() => alert('記録をクリップボードにコピーしました！'))
                .catch(() => alert('コピーに失敗しました。'));
        } else {
            alert('お使いのブラウザはクリップボード機能に対応していません。');
        }
    };

    const renderTempChart = () => {
        const ctx = document.getElementById('temp-chart').getContext('2d');
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const filteredData = db.temperatures
            .filter(t => new Date(t.date) >= sixtyDaysAgo && t.temp)
            .sort((a,b) => new Date(a.date) - new Date(b.date));

        const labels = filteredData.map(t => formatDate(t.date, 'short'));
        const data = filteredData.map(t => t.temp);

        if (tempChart) tempChart.destroy();

        tempChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{
                label: '基礎体温 (°C)', data, borderColor: 'rgba(255, 105, 180, 1)', tension: 0.1
            }]},
            options: { scales: { y: { beginAtZero: false, suggestedMin: 35.5, suggestedMax: 37.5 }}}
        });
    };

    const toDateString = (date) => date.toISOString().split('T')[0];
    const formatDate = (dateStr, format = 'long') => {
        const [year, month, day] = dateStr.split('-');
        return format === 'short' ? `${parseInt(month)}/${parseInt(day)}` : `${year}年${parseInt(month)}月${parseInt(day)}日`;
    };
    
    const updateDB = (key, value, identifier, shouldExist) => {
        const index = db[key].findIndex(item => item[identifier] === value[identifier]);
        if (index > -1) {
            if (shouldExist) db[key][index] = value; else db[key].splice(index, 1);
        } else if (shouldExist) {
            db[key].push(value);
        }
    };
    
    const saveAndRender = () => {
        saveData();
        render();
        closeModal();
    };

    const registerServiceWorker = () => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(reg => console.log('Service Worker: Registered'))
                    .catch(err => console.log(`Service Worker: Error: ${err}`));
            });
        }
    };

    init();
});