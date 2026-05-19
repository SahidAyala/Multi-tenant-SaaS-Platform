terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "atlas-terraform-state-dev"
    key            = "atlas/dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "atlas-terraform-locks"
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "atlas"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "atlas-dev"
  environment = "dev"
  azs         = ["us-east-1a", "us-east-1b"]
}

module "networking" {
  source = "../../modules/networking"

  name_prefix        = local.name_prefix
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = local.azs
  tags               = { Environment = local.environment }
}

module "rds" {
  source = "../../modules/rds"

  name_prefix           = local.name_prefix
  environment           = local.environment
  instance_class        = "db.t3.medium"
  allocated_storage     = 20
  db_name               = "atlas_dev"
  db_username           = "atlas"
  data_subnet_ids       = module.networking.data_subnet_ids
  rds_security_group_id = module.networking.rds_security_group_id
  rds_monitoring_role_arn = ""
  tags                  = { Environment = local.environment }
}

module "ecs" {
  source = "../../modules/ecs"

  name_prefix            = local.name_prefix
  environment            = local.environment
  aws_region             = "us-east-1"
  cpu                    = 512
  memory                 = 1024
  desired_count          = 1
  private_subnet_ids     = module.networking.private_subnet_ids
  api_security_group_id  = module.networking.api_security_group_id
  alb_target_group_arn   = ""
  db_secret_arn          = module.rds.db_secret_arn
  jwt_secret_arn         = ""
  secret_arns            = [module.rds.db_secret_arn]
  tags                   = { Environment = local.environment }
}
