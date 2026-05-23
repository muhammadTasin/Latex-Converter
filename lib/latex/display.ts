import type { ConversionMetadata } from "@/lib/latex/types";

export function isStandaloneDependency(metadata?: Pick<ConversionMetadata, "fileRole" | "projectRole">): boolean {
  return metadata?.fileRole === "dependency-library" && metadata.projectRole !== "project";
}

export function getDetectedDisplayValue(metadata?: Pick<ConversionMetadata, "fileRole" | "inputType">): string {
  return metadata?.fileRole ?? metadata?.inputType ?? "pending";
}

export function getOutputHeading(metadata?: Pick<ConversionMetadata, "fileRole" | "projectRole">): string {
  return isStandaloneDependency(metadata) ? "Raw Dependency Source" : "LaTeX Preview";
}

export function isCompileReadyDisabled(metadata?: Pick<ConversionMetadata, "fileRole" | "projectRole">): boolean {
  return isStandaloneDependency(metadata);
}

export function shouldShowDocumentMetadataFields(metadata?: Pick<ConversionMetadata, "fileRole" | "projectRole">): boolean {
  return !isStandaloneDependency(metadata);
}

export function getSourceTip(metadata?: Pick<ConversionMetadata, "fileRole" | "projectRole">): string {
  return isStandaloneDependency(metadata)
    ? "Dependency file detected. Use this with a main .tex document."
    : "For getting 100% accurate text, you should upload small chunks of your project (ideally under 2MB).";
}

