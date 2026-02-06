
from os import PathLike

def is_secret(file_content: str) -> bool:
    return "SECRET" in file_content

def make_public_version(file_content: str) -> str:
    return file_content.replace("SECRET", "MAGIC")


class SecretsConfig:

    def __init__(self, secret_src_dir: PathLike) -> None:
        self.secret_src_dir = secret_src_dir