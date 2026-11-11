const fs = require('fs');
const path = require('path');

const appPath = path.join('e:', 'jimpitan', 'frontend', 'src', 'app', 'App.js');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Remove top-level 'const rumahList = homeList;'
content = content.replace('const rumahList = homeList;\n', '');
content = content.replace('const rumahList = homeList;', '');

// 2. Add rumahList state and fetchRefWarga effect inside App
const targetState = 'const [endPoint, setEndPoint] = useState(ENDPOINT_BASE_URL);';
const newCode = `const [endPoint, setEndPoint] = useState(ENDPOINT_BASE_URL);
  const [rumahList, setRumahList] = useState(homeList);

  useEffect(() => {
    const fetchRefWarga = async () => {
      try {
        const response = await fetch(\`\${endPoint}/api/ref-warga\`);
        if (response.ok) {
          const result = await response.json();
          if (
            result.status === "OK" &&
            Array.isArray(result.data) &&
            result.data.length > 0
          ) {
            const sorted = [...result.data].sort(
              (a, b) => Number(a.nomor) - Number(b.nomor)
            );
            setRumahList(sorted);
          }
        }
      } catch (err) {
        console.warn("Gagal mengambil data ref-warga dinamis, menggunakan fallback statis:", err);
      }
    };
    fetchRefWarga();
  }, [endPoint]);`;

if (!content.includes('fetchRefWarga')) {
  content = content.replace(targetState, newCode);
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('App.js patched successfully for dynamic rumahList');
} else {
  console.log('App.js already has fetchRefWarga');
}
