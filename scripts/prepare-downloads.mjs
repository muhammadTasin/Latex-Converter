import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const RAW_DIR = "fixtures/aggressive/from-downloads/raw";
const EXT_DIR = "fixtures/aggressive/from-downloads/extracted";

if (!fs.existsSync(EXT_DIR)) {
  fs.mkdirSync(EXT_DIR, { recursive: true });
}

const files = fs.readdirSync(RAW_DIR);

for (const file of files) {
  const filePath = path.join(RAW_DIR, file);
  const ext = path.extname(file).toLowerCase();
  const name = path.parse(file).name;

  if (file.endsWith(".tar.gz")) {
    const projectName = file.slice(0, -7);
    const targetDir = path.join(EXT_DIR, projectName);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
    console.log(`Extracting ${file} to ${targetDir}...`);
    try {
      execSync(`tar -xzf "${filePath}" -C "${targetDir}"`);
    } catch (err) {
      console.error(`Failed to extract ${file}: ${err.message}`);
    }
  } else if (ext === ".zip") {
    const targetDir = path.join(EXT_DIR, name);
    console.log(`Extracting ${file} to ${targetDir}...`);
    try {
      execSync(`powershell.exe -NoProfile -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${targetDir}' -Force"`);
    } catch (err) {
      console.error(`Failed to extract ${file}: ${err.message}`);
    }
  } else if (ext === ".tex" || ext === ".sty" || ext === ".cls" || ext === ".bib") {
    console.log(`Copying ${file} to ${EXT_DIR}...`);
    fs.copyFileSync(filePath, path.join(EXT_DIR, file));
  }
}
