import { convertTextToLatex } from "./lib/latex/converter.ts";
import fs from "fs";

const text = fs.readFileSync("fixtures/hard-research-mixture-input.txt", "utf8");
const res = convertTextToLatex({ text, filename: "hard.txt" });
console.log(res.latex);
