import { Injectable } from '@nestjs/common';
import { NotFoundException, Result, isNil } from '@atlas/shared-kernel';
import { GetWorkflowExecutionQuery } from './get-execution.query';
import { WorkflowExecutionRepositoryPort } from '../../../domain/repositories/workflow-execution.repository.port';
import { WorkflowExecutionDto } from '../../dtos/workflow-execution.dto';

@Injectable()
export class GetWorkflowExecutionHandler {
  constructor(private readonly executionRepository: WorkflowExecutionRepositoryPort) {}

  async execute(query: GetWorkflowExecutionQuery): Promise<Result<WorkflowExecutionDto>> {
    const execution = await this.executionRepository.findById(query.executionId);
    if (isNil(execution)) {
      return Result.fail(new NotFoundException('WorkflowExecution', query.executionId));
    }
    return Result.ok(WorkflowExecutionDto.fromEntity(execution));
  }
}
