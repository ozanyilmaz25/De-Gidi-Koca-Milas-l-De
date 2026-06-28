// ======================================
// DE GİDİ GOCA MİLAS DE
// Milas Köy Bulma Oyunu (Gelişmiş İstatistik Sürümü)
// ======================================

const puanYazi = document.getElementById("puan");
const soruYazi = document.getElementById("soru");
const mesaj = document.getElementById("mesaj");
const sureYazi = document.getElementById("sure");
const soruNoYazi = document.getElementById("soruNo");

const baslatBtn = document.getElementById("baslatBtn");
const yenidenBtn = document.getElementById("yenidenBtn");

const oyunSonu = document.getElementById("oyunSonu");
const finalPuan = document.getElementById("finalPuan");
const tekrarBtn = document.getElementById("tekrarBtn");
const bgMusic = document.getElementById("bgMusic");

let map;
let geojsonLayer;
let tumKoyler = [];
let aktifKoy = null;
let sorulmayanKoyler = [];
let puan = 0;
let soruNo = 1;
let oyunBasladi = false;
let kalanSure = 900; // 15 dakika 00 saniye
let timer = null;
let dogruSayisi = 0;
let yanlisSayisi = 0;
let dogrulukYuzdesi = 0;

// --- DEĞİŞKENLER ---
let aktifKoyHakki = 3;       
let yanlisKoylerListesi = [];
let tiklamaKilitli = false; // Tıklama kilidi başlangıçta açık 

// --- İSTATİSTİK LİSTELERİ ---
let bilinenKoylerListesi = [];   // Doğru tahmin edilen köy isimleri
let bilinemeyenKoylerListesi = []; // Hakkı bitip geçilen köy isimleri

// --- WEB AUDIO API DEĞİŞKENLERİ ---
let audioCtx = null;
let source = null;
let filterNode = null;
let musicGainNode = null; 

// ⏱️ Saniyeyi Dakika:Saniye (00:00) Formatına Çeviren Yardımcı Fonksiyon
function sureFormatla(saniye) {
    let dk = Math.floor(saniye / 60);
    let sn = saniye % 60;
    
    // Saniyeler tek haneliyse başına 0 koysun (Örn: 13:05 olsun, 13:5 değil)
    if (sn < 10) {
        sn = "0" + sn;
    }
    return dk + ":" + sn;
}

// Sesi işlemek ve bası/tizi bozabilmek için filtre katmanı oluşturuyoruz
function sesSisteminiKur() {
    if (audioCtx) return; 
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaElementSource(bgMusic);
    
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
    
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(20000, audioCtx.currentTime);

    source.connect(musicGainNode);
    musicGainNode.connect(filterNode);
    filterNode.connect(audioCtx.destination);
}

// RETRO DOĞRU CEVAP SES EFEKTİ ÜRETİCİSİ
function playRetroWinSound() {
    if (!audioCtx) return;

    if (musicGainNode) {
        musicGainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    }

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "triangle"; 
    
    osc.frequency.setValueAtTime(523.25, t);       
    osc.frequency.setValueAtTime(659.25, t + 0.08); 
    osc.frequency.setValueAtTime(783.99, t + 0.16); 
    osc.frequency.setValueAtTime(1046.50, t + 0.24);
    
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.setValueAtTime(0.08, t + 0.24);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.45);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.45);

    setTimeout(() => {
        if (musicGainNode) {
            musicGainNode.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.15);
        }
    }, 450);
}

// Haritayı Oluştur
map = L.map("map", { zoomControl: true }).setView([37.32, 27.78], 10);

// Uydu Haritası
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 20,
    attribution: "© Esri"
}).addTo(map);

function normalStil() {
    return { color: "#ff0000", weight: 2, fillColor: "#ff0000", fillOpacity: 0.08 };
}

function hover(e) {
    if (!oyunBasladi) return;
    let layer = e.target;
    if (layer.dogruBilindi) return; 
    if (yanlisKoylerListesi.includes(layer)) return;
    
    layer.setStyle({ weight: 4, color: "#00ffff", fillOpacity: 0.25 });
}

function hoverBitis(e) {
    if (!oyunBasladi) return;
    let layer = e.target;
    if (layer.dogruBilindi) return; 
    if (yanlisKoylerListesi.includes(layer)) return;
    
    geojsonLayer.resetStyle(layer);
}

// GeoJSON Yükleme
fetch("KOY.geojson")
    .then(response => response.json())
    .then(data => {
        geojsonLayer = L.geoJSON(data, {
            style: normalStil,
            onEachFeature: function (feature, layer) {
                tumKoyler.push({ ad: feature.properties.AD, layer: layer });
                layer.on("mouseover", hover);
                layer.on("mouseout", hoverBitis);
                layer.on("click", function () {
                    if (!oyunBasladi) return;
                    koyKontrol(feature, layer);
                });
            }
        }).addTo(map);
        map.fitBounds(geojsonLayer.getBounds());
        mesaj.innerHTML = ""; // Girişteki yazı kaldırıldı
    })
    
    .catch(err => {
        console.error(err);
        mesaj.innerHTML = "KOY.geojson yüklenemedi.";
    });

function yeniSoru() {
    yanlisKoylerListesi.forEach(layer => {
        geojsonLayer.resetStyle(layer);
        layer.on("mouseout", hoverBitis);
    });
    yanlisKoylerListesi = []; 

    aktifKoyHakki = 3;

    if (sorulmayanKoyler.length === 0) {
        oyunBitir();
        return;
    }

    let rastgele = Math.floor(Math.random() * sorulmayanKoyler.length);
    aktifKoy = sorulmayanKoyler[rastgele];
    sorulmayanKoyler.splice(rastgele, 1);

    soruYazi.innerHTML = "📍 <b>" + aktifKoy.ad + "</b> köyünü bulun. <span style='color: #ffcc00;'>(Kalan Hak: " + aktifKoyHakki + ")</span>";
    soruNoYazi.innerHTML = soruNo;
}

function oyunuBaslat() {
    sesSisteminiKur();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    tumKoyler.forEach(koy => {
        koy.layer.dogruBilindi = false;
        geojsonLayer.resetStyle(koy.layer);
    });

    if(bgMusic) {
        bgMusic.volume = 0.3; 
        bgMusic.playbackRate = 1.0; 
        if (filterNode) filterNode.frequency.setValueAtTime(20000, audioCtx.currentTime); 
        if (musicGainNode) musicGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
        bgMusic.play().catch(error => console.log("Müzik çalma hatası:", error));
    }

    puan = 0;
    soruNo = 1;
    kalanSure = 900;
    dogruSayisi = 0;
    yanlisSayisi = 0;
    dogrulukYuzdesi = 0;
    yanlisKoylerListesi = [];
    bilinenKoylerListesi = [];
    bilinemeyenKoylerListesi = [];
    aktifKoyHakki = 3;
    oyunBasladi = true;
    tiklamaKilitli = false;
    sorulmayanKoyler = [...tumKoyler];

    puanYazi.innerHTML = puan;
    sureYazi.innerHTML = sureFormatla(kalanSure); // ⏱️ Başlangıçta dakika formatında yazdır
    mesaj.innerHTML = "";
    baslatBtn.style.display = "none";
    yenidenBtn.style.display = "inline-block";

    yeniSoru();
    zamanlayici();
}

baslatBtn.addEventListener("click", oyunuBaslat);
yenidenBtn.addEventListener("click", () => location.reload());
tekrarBtn.addEventListener("click", () => location.reload());

function koyKontrol(feature, layer) {
    if (!aktifKoy || tiklamaKilitli) return; 
    const secilenKoy = feature.properties.AD;

    if (yanlisKoylerListesi.includes(layer)) return;

    const efektKatmani = document.getElementById("efektKatmani");
    const oyunAlani = document.getElementById("oyun");

    if (secilenKoy === aktifKoy.ad) {
        // DOĞRU CEVAP
        puan += 5; 
        dogruSayisi++;
        bilinenKoylerListesi.push(aktifKoy.ad); 
        layer.off("click");
        puanYazi.innerHTML = puan;
        mesaj.innerHTML = "✅ Doğru Cevap";
        layer.dogruBilindi = true; 

        playRetroWinSound();

        if (efektKatmani) {
            efektKatmani.classList.add("flash-dogru-aktif");
            setTimeout(() => {
                efektKatmani.classList.remove("flash-dogru-aktif");
            }, 500);
        }

        layer.bindTooltip("Aferin len", { 
            permanent: false, 
            direction: "center", 
            className: "bulunduEtiket" 
        }).openTooltip(); 

        layer.setStyle({ color: "#00ff00", fillColor: "#00ff00", fillOpacity: 0.40, weight: 4 });

        tiklamaKilitli = true; 

        setTimeout(() => {
            layer.setStyle({ color: "#00aa00", fillColor: "#00ff00", fillOpacity: 0.55, weight: 3 });
            soruNo++;
            yeniSoru();
            tiklamaKilitli = false; 
        }, 1000);

        setTimeout(() => {
            layer.unbindTooltip();
        }, 3000);

    } else {
        // YANLIŞ CEVAP
        aktifKoyHakki--; 
        puan -= 1; 
        yanlisSayisi++;
        
        puanYazi.innerHTML = puan;

        if (bgMusic && filterNode && audioCtx) {
            bgMusic.playbackRate = 0.60; 
            filterNode.frequency.setValueAtTime(280, audioCtx.currentTime); 
            
            setTimeout(() => {
                bgMusic.playbackRate = 1.0;
                filterNode.frequency.exponentialRampToValueAtTime(20000, audioCtx.currentTime + 0.25);
            }, 1500); 
        }

        if (efektKatmani && oyunAlani) {
            efektKatmani.classList.add("flash-yanlis-aktif");
            oyunAlani.classList.add("shake-aktif");
            setTimeout(() => {
                efektKatmani.classList.remove("flash-yanlis-aktif");
                oyunAlani.classList.remove("shake-aktif");
            }, 500);
        }

        yanlisKoylerListesi.push(layer);

        layer.setStyle({
            color: "#8b0000",      
            fillColor: "#ff0000",  
            fillOpacity: 0.65,     
            weight: 4
        });

        layer.off("mouseout", hoverBitis);

        if (aktifKoyHakki > 0) {
            mesaj.innerHTML = "❌ Yanlış! (-1 Puan)";
            soruYazi.innerHTML = "📍 <b>" + aktifKoy.ad + "</b> köyünü bulun. <span style='color: #ffcc00;'>(Kalan Hak: " + aktifKoyHakki + ")</span>";
        } else {
            bilinemeyenKoylerListesi.push(aktifKoy.ad); 
            mesaj.innerHTML = "💥 Hakkınız Bitti! Sonraki Köye Geçiliyor.";
            tiklamaKilitli = true; 

            setTimeout(() => {
                soruNo++;
                yeniSoru();
                tiklamaKilitli = false; 
            }, 1200);
        }
    }
}

function zamanlayici() {
    clearInterval(timer);
    timer = setInterval(() => {
        kalanSure--;
        sureYazi.innerHTML = sureFormatla(kalanSure); // ⏱️ Geri sayarken dakika formatında yazdır
        if (kalanSure <= 0) {
            clearInterval(timer);
            oyunBitir();
        }
    }, 1000);
}

function oyunBitir() {
    oyunBasladi = false;
    clearInterval(timer);

    if(bgMusic) {
        bgMusic.pause(); 
        bgMusic.currentTime = 0; 
        bgMusic.playbackRate = 1.0;
    }

    let toplamTiklama = dogruSayisi + yanlisSayisi;
    dogrulukYuzdesi = toplamTiklama > 0 ? Math.round((dogruSayisi / toplamTiklama) * 100) : 0;

    let dogruKoylerHtml = bilinenKoylerListesi.length > 0 
        ? bilinenKoylerListesi.map(koy => `<span class="koy-badge-dogru">${koy}</span>`).join("")
        : `<span style="color:#6b7280; font-style:italic; font-size:13px;">Hiç köy bulunamadı.</span>`;

    let yanlisKoylerHtml = bilinemeyenKoylerListesi.length > 0 
        ? bilinemeyenKoylerListesi.map(koy => `<span class="koy-badge-yanlis">${koy}</span>`).join("")
        : `<span style="color:#6b7280; font-style:italic; font-size:13px;">Hakkı biten köy yok.</span>`;

    soruYazi.innerHTML = "🎉 Oyun Tamamlandı";
    finalPuan.innerHTML = puan;
    oyunSonu.classList.remove("gizli");

    oyunSonu.querySelector(".popup").innerHTML = `
        <h2 style="margin-bottom: 5px; color: #1f2937;">🏆 Oyun Bitti</h2>
        <h1 style="color: #1f2937; font-size: 48px; margin-bottom: 15px;">${puan} Puan</h1>
        
        <div class="game-over-scroll">
            
            <div class="stats-row">
                <span>Doğru Bilinen Köy Sayısı:</span>
                <strong>${dogruSayisi}</strong>
            </div>
            
            <div class="stats-row">
                <span>Toplam Yanlış Tıklama Sayısı:</span>
                <strong>${yanlisSayisi}</strong>
            </div>
            
            <div class="stats-row" style="border-bottom: none;">
                <span>Genel Başarı Yüzdesi:</span>
                <strong style="color: #16a34a; font-size: 18px;">%${dogrulukYuzdesi}</strong>
            </div>
            
            <h4 class="section-title" style="color: #16a34a; margin-top: 20px;">Doğru Bilinen Köyler</h4>
            <div class="koy-konteyner bg-dogru-kutusu">
                ${dogruKoylerHtml}
            </div>

            <h4 class="section-title" style="color: #dc2626; margin-top: 20px;">Bulunamayan Köyler (Hakkı Biten)</h4>
            <div class="koy-konteyner bg-yanlis-kutusu" style="margin-bottom: 10px;">
                ${yanlisKoylerHtml}
            </div>
            
        </div>
        
        <button id="yenidenOyna" style="width: 100%; padding: 14px; background: #16a34a; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: bold; margin-top: 20px; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2);">
            🔄 Tekrar Oyna
        </button>
    `;

    document.getElementById("yenidenOyna").onclick = () => location.reload();
}
