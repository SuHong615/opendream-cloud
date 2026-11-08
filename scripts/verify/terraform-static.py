import glob

problems = []
files = sorted(glob.glob(r"deploy/terraform/*.tf"))
for path in files:
    text = open(path, encoding="utf-8").read()
    if text.count("{") != text.count("}"):
        problems.append(f"{path}: unbalanced braces")
    if "required_providers" in text and "aliyun" not in text:
        problems.append(f"{path}: required_providers without aliyun")

joined = "".join(open(path, encoding="utf-8").read() for path in files)
required = [
    "aliyun_vpc",
    "aliyun_vswitch",
    "aliyun_cs_managed_kubernetes",
    "aliyun_cs_node_pool",
    "aliyun_cr_ee_instance",
    "aliyun_db_instance",
    "aliyun_kvstore_instance",
    "aliyun_oss_bucket",
]
for resource in required:
    if resource not in joined:
        problems.append(f"missing resource: {resource}")

for path in ["deploy/terraform/variables.tf", "deploy/terraform/outputs.tf", "deploy/terraform/versions.tf"]:
    if not glob.glob(path):
        problems.append(f"missing file: {path}")

print("terraform_files:", len(files))
print("problems:", problems if problems else "none")
print("TERRAFORM_STATIC=PASS" if not problems else "TERRAFORM_STATIC=FAIL")
