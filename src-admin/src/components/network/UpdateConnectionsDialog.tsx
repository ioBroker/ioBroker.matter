/**
 * UpdateConnectionsDialog - Dialog for refreshing network connection data
 * Allows users to request fresh network diagnostics from nodes
 */

import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    FormControlLabel,
    Checkbox,
    CircularProgress,
    Box,
} from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';

export type SelectedNodeType = 'online' | 'offline' | 'unknown';

interface UpdateConnectionsDialogProps {
    open: boolean;
    selectedNodeType: SelectedNodeType;
    selectedNodeName: string;
    selectedNodeId: string | null;
    onlineNeighborIds: string[];
    onClose: () => void;
    onUpdate: (nodeIds: string[]) => Promise<void>;
}

interface UpdateConnectionsDialogState {
    includeNeighbors: boolean;
    isUpdating: boolean;
}

class UpdateConnectionsDialog extends React.Component<UpdateConnectionsDialogProps, UpdateConnectionsDialogState> {
    private updateTimeoutId?: ReturnType<typeof setTimeout>;

    constructor(props: UpdateConnectionsDialogProps) {
        super(props);
        this.state = {
            includeNeighbors: false,
            isUpdating: false,
        };
    }

    componentDidUpdate(prevProps: UpdateConnectionsDialogProps): void {
        // Reset state when dialog opens
        if (this.props.open && !prevProps.open) {
            this.setState({
                includeNeighbors: false,
                isUpdating: false,
            });
        }
    }

    componentWillUnmount(): void {
        if (this.updateTimeoutId) {
            clearTimeout(this.updateTimeoutId);
        }
    }

    getUpdateCount(): number {
        const { selectedNodeType, onlineNeighborIds } = this.props;
        const { includeNeighbors } = this.state;

        if (selectedNodeType === 'online') {
            return includeNeighbors ? 1 + onlineNeighborIds.length : 1;
        }
        // offline and unknown: update neighbors only
        return onlineNeighborIds.length;
    }

    getNodeIdsToUpdate(): string[] {
        const { selectedNodeType, selectedNodeId, onlineNeighborIds } = this.props;
        const { includeNeighbors } = this.state;

        if (selectedNodeType === 'online' && selectedNodeId) {
            const nodeIds = [selectedNodeId];
            if (includeNeighbors) {
                nodeIds.push(...onlineNeighborIds);
            }
            return nodeIds;
        }
        // offline and unknown: update neighbors only
        return onlineNeighborIds;
    }

    handleUpdate = async (): Promise<void> => {
        const updateCount = this.getUpdateCount();
        if (this.state.isUpdating || updateCount === 0) {
            return;
        }

        this.setState({ isUpdating: true });

        // 30s timeout to auto-close
        this.updateTimeoutId = setTimeout(() => {
            console.warn('Update connections timed out after 30s');
            this.props.onClose();
        }, 30000);

        try {
            const nodeIds = this.getNodeIdsToUpdate();
            await this.props.onUpdate(nodeIds);
            this.props.onClose();
        } catch (error) {
            console.error('Failed to update connections:', error);
            this.props.onClose();
        } finally {
            if (this.updateTimeoutId) {
                clearTimeout(this.updateTimeoutId);
                this.updateTimeoutId = undefined;
            }
            this.setState({ isUpdating: false });
        }
    };

    handleIncludeNeighborsChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ includeNeighbors: event.target.checked });
    };

    renderContent(): React.ReactNode {
        const { selectedNodeType, selectedNodeName, onlineNeighborIds } = this.props;
        const { includeNeighbors } = this.state;

        switch (selectedNodeType) {
            case 'online':
                return (
                    <>
                        <Typography>{I18n.t('Refresh network information for "%s".', selectedNodeName)}</Typography>
                        {onlineNeighborIds.length > 0 && (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={includeNeighbors}
                                        onChange={this.handleIncludeNeighborsChange}
                                    />
                                }
                                label={I18n.t(
                                    'Include %s connected online neighbor(s)',
                                    onlineNeighborIds.length.toString(),
                                )}
                                sx={{ mt: 2 }}
                            />
                        )}
                    </>
                );

            case 'offline':
                return (
                    <>
                        <Typography>{I18n.t('"%s" appears to be offline.', selectedNodeName)}</Typography>
                        <Typography sx={{ mt: 1 }}>
                            {onlineNeighborIds.length > 0
                                ? I18n.t(
                                      'Update network data from its %s online neighbor(s) to refresh connection info.',
                                      onlineNeighborIds.length.toString(),
                                  )
                                : I18n.t('No online neighbors available to update.')}
                        </Typography>
                    </>
                );

            case 'unknown':
                return (
                    <>
                        <Typography>
                            {I18n.t('This device is not commissioned to this fabric and cannot be queried directly.')}
                        </Typography>
                        <Typography sx={{ mt: 1 }}>
                            {onlineNeighborIds.length > 0
                                ? I18n.t(
                                      'Update network data from %s node(s) that see(s) this device to refresh info.',
                                      onlineNeighborIds.length.toString(),
                                  )
                                : I18n.t('No online nodes available that see this device.')}
                        </Typography>
                    </>
                );
        }
    }

    render(): React.ReactNode {
        const { open, onClose } = this.props;
        const { isUpdating } = this.state;

        const updateCount = this.getUpdateCount();
        const buttonText =
            updateCount === 0 ? I18n.t('No nodes to update') : I18n.t('Update %s node(s)', updateCount.toString());

        return (
            <Dialog
                open={open}
                onClose={(_event, reason) => {
                    // Don't close on backdrop click while updating
                    if (reason === 'backdropClick' && isUpdating) {
                        return;
                    }
                    onClose();
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{I18n.t('Update Connections')}</DialogTitle>
                <DialogContent>{this.renderContent()}</DialogContent>
                <DialogActions>
                    <Button
                        onClick={onClose}
                        disabled={isUpdating}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                    <Button
                        onClick={this.handleUpdate}
                        variant="contained"
                        disabled={isUpdating || updateCount === 0}
                    >
                        {isUpdating ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CircularProgress
                                    size={18}
                                    color="inherit"
                                />
                                {I18n.t('Updating...')}
                            </Box>
                        ) : (
                            buttonText
                        )}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default UpdateConnectionsDialog;
