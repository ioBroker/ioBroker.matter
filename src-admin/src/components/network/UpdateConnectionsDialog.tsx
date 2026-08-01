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
import { I18n } from '@iobroker/gui-components';

export type SelectedNodeType = 'online' | 'offline' | 'unknown';

interface UpdateConnectionsDialogProps {
    open: boolean;
    selectedNodeType: SelectedNodeType;
    selectedNodeName: string;
    selectedNodeId: string | null;
    onlineNeighborIds: string[];
    onClose: () => void;
    onUpdate: (nodeIds: string[]) => Promise<void>;
    /**
     * BR-refresh variant: the confirm always refreshes the Border Router's diagnostics (handled by
     * the caller), and the connected commissioned nodes are optionally re-read too. Confirm stays
     * enabled even with no node selected (diagnostics-only).
     */
    borderRouterRefresh?: boolean;
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
            // BR-refresh defaults to also re-reading the connected nodes.
            includeNeighbors: !!props.borderRouterRefresh,
            isUpdating: false,
        };
    }

    componentDidUpdate(prevProps: UpdateConnectionsDialogProps): void {
        // Reset state when dialog opens
        if (this.props.open && !prevProps.open) {
            this.setState({
                includeNeighbors: !!this.props.borderRouterRefresh,
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
        // BR refresh: the connected nodes are opt-in (diagnostics refresh is separate).
        if (this.props.borderRouterRefresh) {
            return includeNeighbors ? onlineNeighborIds.length : 0;
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
        // BR refresh: only the connected nodes the user opted to also re-read.
        if (this.props.borderRouterRefresh) {
            return includeNeighbors ? onlineNeighborIds : [];
        }
        // offline and unknown: update neighbors only
        return onlineNeighborIds;
    }

    handleUpdate = async (): Promise<void> => {
        const updateCount = this.getUpdateCount();
        // A BR refresh always has something to do (the diagnostics refresh), even with 0 nodes.
        if (this.state.isUpdating || (updateCount === 0 && !this.props.borderRouterRefresh)) {
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
                // BR-refresh variant: always refreshes the BR's diagnostics; connected nodes opt-in.
                if (this.props.borderRouterRefresh) {
                    return (
                        <>
                            <Typography>
                                {I18n.t('Refresh the Border Router diagnostics for "%s".', selectedNodeName)}
                            </Typography>
                            {onlineNeighborIds.length > 0 && (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={includeNeighbors}
                                            onChange={this.handleIncludeNeighborsChange}
                                        />
                                    }
                                    label={I18n.t(
                                        'Also refresh the %s connected node(s)',
                                        onlineNeighborIds.length.toString(),
                                    )}
                                    sx={{ mt: 2 }}
                                />
                            )}
                        </>
                    );
                }
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

        const { borderRouterRefresh } = this.props;
        const updateCount = this.getUpdateCount();
        let buttonText: string;
        if (borderRouterRefresh) {
            buttonText =
                updateCount > 0
                    ? I18n.t('Refresh diagnostics and %s node(s)', updateCount.toString())
                    : I18n.t('Refresh diagnostics only');
        } else {
            buttonText =
                updateCount === 0 ? I18n.t('No nodes to update') : I18n.t('Update %s node(s)', updateCount.toString());
        }
        const confirmDisabled = isUpdating || (updateCount === 0 && !borderRouterRefresh);

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
                        disabled={confirmDisabled}
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
