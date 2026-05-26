import { Injectable, Logger } from '@nestjs/common';
import { NotFoundException, Result, isNil } from '@atlas/shared-kernel';
import { CancelWorkflowExecutionCommand } from './cancel-execution.command';
import { WorkflowExecutionRepositoryPort } from '../../../domain/repositories/workflow-execution.repository.port';
import { WorkflowExecutionDto } from '../../dtos/workflow-execution.dto';

@Injectable()
export class CancelWorkflowExecutionHandler {
  private readonly logger = new Logger(CancelWorkflowExecutionHandler.name);

  constructor(private readonly executionRepository: WorkflowExecutionRepositoryPort) {}

  async execute(
    command: CancelWorkflowExecutionCommand,
  ): Promise<Result<WorkflowExecutionDto>> {
    const execution = await this.executionRepository.findById(command.executionId);
    if (isNil(execution)) {
      return Result.fail(new NotFoundException('WorkflowExecution', command.executionId));
    }

    execution.cancel(command.reason);
    const saved = await this.executionRepository.save(execution);

    this.logger.log(`Workflow execution cancelled: ${saved.executionId}`);
    return Result.ok(WorkflowExecutionDto.fromEntity(saved));
  }
}
