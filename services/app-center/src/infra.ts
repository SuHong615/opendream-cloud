// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface BuildInput {
  app_id: string;
  template: string;
  context_subdir: string;
  build_no: number;
}

export interface BuildResult {
  image_digest: string;
  sbom_key: string;
  log_ref: string;
  scan_report: { passed: boolean; critical: number };
}

/** BuildKit 接口：G5 集成时替换为 rootless BuildKit Job → ACR。 */
export interface BuildKitClient {
  build(input: BuildInput): Promise<BuildResult>;
}

export interface DeployInput {
  app_id: string;
  build_id: string;
  image_digest: string;
  host: string;
}

export interface DeployResult {
  host: string;
  url: string;
}

/** K8s 部署接口：G5 集成时替换为 Deployment(1C2G)+Service+Ingress。 */
export interface Deployer {
  deploy(input: DeployInput): Promise<DeployResult>;
  scale(appId: string, replicas: number): Promise<void>;
}

export class MockBuildKit implements BuildKitClient {
  async build(input: BuildInput): Promise<BuildResult> {
    return {
      image_digest: `sha256:${"b".repeat(64)}`,
      sbom_key: `sbom/${input.app_id}/${input.build_no}.spdx.json`,
      log_ref: `logs/build/${input.app_id}/${input.build_no}.log`,
      scan_report: { passed: true, critical: 0 },
    };
  }
}

export class MockDeployer implements Deployer {
  async deploy(input: DeployInput): Promise<DeployResult> {
    return { host: input.host, url: `https://${input.host}` };
  }

  async scale(): Promise<void> {
    return;
  }
}
