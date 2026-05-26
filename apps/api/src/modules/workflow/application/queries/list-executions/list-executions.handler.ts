import { Injectable } from '@nestjs/common';
import { PaginatedResult, Result } from '@atlas/shared-kernel';
import { ListWorkflowExecutionsQuery } from './list-executions.query';
import { WorkflowExecutionRepositoryPort } from '../../../domain/repositories/workflow-execution.repository.port';
import { WorkflowExecutionDto } from '../../dtos/workflow-execution.dto';

@Injectable()
export class ListWorkflowExecutionsHandler {
  constructor(private readonly executionRepository: WorkflowExecutionRepositoryPort) {}

  async execute(
    query: ListWorkflowExecutionsQuery,
  ): Promise<Result<PaginatedResult<WorkflowExecutionDto>>> {
    const result = await this.executionRepository.findMany(
      { status: query.status },
      { page: query.page, limit: query.limit },
    );

    return Result.ok({
      data: result.data.map((e) => WorkflowExecutionDto.fromEntity(e)),
      meta: result.meta,
    });
  }
}
