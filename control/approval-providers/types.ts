export interface ApprovalRequest {
    device: string;
    commandId: string;
    formattedCall: string;
}

export interface ApprovalDecision {
    approved: boolean;
    reason?: string;
}

export interface ApprovalProvider {
    approve(request: ApprovalRequest): Promise<ApprovalDecision>;
    shutdown?(): Promise<void>;
}
