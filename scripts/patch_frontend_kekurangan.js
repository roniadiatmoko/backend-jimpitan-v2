const fs = require('fs');
const path = require('path');

// 1. Patch DetailKekuranganBayar.js
const detailPath = path.join('e:', 'jimpitan', 'frontend', 'src', 'features', 'admin', 'laporan', 'kekurangan-bayar', 'DetailKekuranganBayar.js');
let detailContent = fs.readFileSync(detailPath, 'utf8');

const targetDetailRegex = /\/\/ Optimasi: nomor -> data rumah\r?\n\s*const homeMap = useMemo\(\(\) => \{[\s\S]*?\}, \[homeList\]\);/;

const newDetailMap = `  const [wargaList, setWargaList] = useState(homeList);

  useEffect(() => {
    const fetchRef = async () => {
      try {
        const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/ref-warga\`);
        if (res.ok) {
          const json = await res.json();
          if (json.status === "OK" && Array.isArray(json.data) && json.data.length > 0) {
            setWargaList(json.data);
          }
        }
      } catch (e) {
        console.warn("Gagal memuat ref-warga:", e);
      }
    };
    fetchRef();
  }, []);

  // Optimasi: nomor -> data rumah
  const homeMap = useMemo(() => {
    const map = {};
    for (const h of wargaList) map[Number(h.nomor)] = h;
    return map;
  }, [wargaList]);`;

if (targetDetailRegex.test(detailContent)) {
  detailContent = detailContent.replace(targetDetailRegex, newDetailMap);
  fs.writeFileSync(detailPath, detailContent, 'utf8');
  console.log('✅ DetailKekuranganBayar.js patched');
} else {
  console.log('❌ DetailKekuranganBayar.js regex failed');
}

// 2. Patch KekuranganBayarTahun.js
const tahunPath = path.join('e:', 'jimpitan', 'frontend', 'src', 'features', 'admin', 'laporan', 'kekurangan-bayar', 'KekuranganBayarTahun.js');
let tahunContent = fs.readFileSync(tahunPath, 'utf8');

const targetTahunRegex = /const homeMap = useMemo\(\(\) => \{[\s\S]*?\}, \[\]\);/;

const newTahunMap = `const [wargaList, setWargaList] = useState(homeList);

  useEffect(() => {
    const fetchRef = async () => {
      try {
        const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/ref-warga\`);
        if (res.ok) {
          const json = await res.json();
          if (json.status === "OK" && Array.isArray(json.data) && json.data.length > 0) {
            setWargaList(json.data);
          }
        }
      } catch (e) {
        console.warn("Gagal memuat ref-warga:", e);
      }
    };
    fetchRef();
  }, []);

  const homeMap = useMemo(() => {
    const map = {};
    for (const home of wargaList) {
      map[String(home.nomor)] = home;
    }
    return map;
  }, [wargaList]);`;

if (targetTahunRegex.test(tahunContent)) {
  tahunContent = tahunContent.replace(targetTahunRegex, newTahunMap);
  fs.writeFileSync(tahunPath, tahunContent, 'utf8');
  console.log('✅ KekuranganBayarTahun.js patched');
} else {
  console.log('❌ KekuranganBayarTahun.js regex failed');
}
