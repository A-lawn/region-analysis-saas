import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

const CENTER_LNG = 116.410;
const CENTER_LAT = 39.914;

function generatePoints(count: number) {
  const points: any[] = [];
  const districts = ["东城","西城","朝阳","海淀"];
  const categories = ["便利店","餐厅","药店","服装店"];
  const clusters = [
    { lng: CENTER_LNG, lat: CENTER_LAT, spread: 0.01, label: "WFJ" },
    { lng: CENTER_LNG + 0.045, lat: CENTER_LAT + 0.02, spread: 0.015, label: "CBD" },
    { lng: CENTER_LNG - 0.03, lat: CENTER_LAT - 0.015, spread: 0.02, label: "XD" },
  ];

  for (let i = 0; i < count; i++) {
    const cluster = clusters[Math.floor(Math.random() * clusters.length)];
    const lng = cluster.lng + (Math.random() - 0.5) * cluster.spread * 2;
    const lat = cluster.lat + (Math.random() - 0.5) * cluster.spread * 2;
    points.push({
      name: "门店_" + cluster.label + "_" + i,
      address: "北京" + districts[Math.floor(Math.random() * 4)] + "区测试路" + Math.floor(Math.random() * 200) + "号",
      lng: Math.round(lng * 1000000) / 1000000,
      lat: Math.round(lat * 1000000) / 1000000,
      category: categories[Math.floor(Math.random() * 4)],
      dailyRevenue: Math.floor(Math.random() * 50000) + 5000,
    });
  }

  for (let i = 0; i < 10; i++) {
    points.push({
      name: "偏远门店" + (i + 1),
      address: "北京房山区偏远路" + (i + 1) + "号",
      lng: Math.round((CENTER_LNG - 0.12 + Math.random() * 0.06) * 1000000) / 1000000,
      lat: Math.round((CENTER_LAT - 0.08 + Math.random() * 0.04) * 1000000) / 1000000,
      category: "便利店",
      dailyRevenue: Math.floor(Math.random() * 20000) + 2000,
    });
  }
  return points;
}

const points = generatePoints(200);
const wb = XLSX.utils.book_new();
const headers = ["名称","地址","经度","纬度","类别","日营业额"];
const rows = points.map((p: any) => [p.name, p.address, p.lng, p.lat, p.category, p.dailyRevenue]);
const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
XLSX.utils.book_append_sheet(wb, ws, "门店数据");

const outDir = path.resolve(__dirname, "..", "..", "sample-data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "sample_beijing_stores.xlsx");
XLSX.writeFile(wb, outPath);
console.log("Sample data written:", outPath);
console.log("Total rows:", points.length);