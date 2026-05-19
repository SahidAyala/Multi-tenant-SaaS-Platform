import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationAggregate } from '../../domain/aggregates/organization.aggregate';
import { OrganizationRepositoryPort } from '../../domain/repositories/organization.repository.port';
import { OrganizationOrmEntity } from './organization.orm-entity';
import { OrganizationMapper } from './organization.mapper';

@Injectable()
export class OrganizationRepository implements OrganizationRepositoryPort {
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    private readonly repo: Repository<OrganizationOrmEntity>,
    private readonly mapper: OrganizationMapper,
  ) {}

  async findById(id: string): Promise<OrganizationAggregate | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? this.mapper.toDomain(orm) : null;
  }

  async findBySlug(slug: string): Promise<OrganizationAggregate | null> {
    const orm = await this.repo.findOne({ where: { slug } });
    return orm ? this.mapper.toDomain(orm) : null;
  }

  async save(organization: OrganizationAggregate): Promise<OrganizationAggregate> {
    const orm = this.mapper.toOrm(organization);
    const saved = await this.repo.save(orm);
    return this.mapper.toDomain(saved);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return this.repo.existsBy({ slug });
  }

  async existsById(id: string): Promise<boolean> {
    return this.repo.existsBy({ id });
  }
}
