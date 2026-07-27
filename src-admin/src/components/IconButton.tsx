import React from 'react';
import { Tooltip, IconButton as MuiIconButton } from '@mui/material';
import {
    QrCode as QrCodeIcon,
    Refresh as RefreshIcon,
    Add as AddIcon,
    Help as HelpIcon,
    KeyboardArrowUp as UpdateIcon,
    Cloud as CloudIcon,
    CloudOff as CloudOffIcon,
    ArrowUpward as ArrowUpwardIcon,
    ArrowDownward as ArrowDownwardIcon,
    Remove as RemoveIcon,
    GitHub as GitHubIcon,
    MonetizationOn,
    Close as CloseIcon,
    Link as LinkIcon,
    Publish as PublishIcon,
    DeleteForever as DeleteForeverIcon,
    Delete as DeleteIcon,
    AddToPhotos as AddToPhotosIcon,
    Build as BuildIcon,
    Edit as EditIcon,
    DomainDisabled as FactoryResetIcon,
    LeakAdd as LeakAddIcon,
    SignalWifiConnectedNoInternet4 as IconNoConnection,
    SignalCellularOff as IconNotAlive,
    ContentCopy as ContentCopyIcon,
    QuestionMark as QuestionMarkIcon,
    SettingsInputAntenna as SettingsInputAntennaIcon,
    SignalWifiStatusbarNull as SignalWifiStatusbarNullIcon,
    Wifi as WifiIcon,
    WifiOff as WifiOffIcon,
    DeviceHub as DeviceHubIcon,
    AutoMode as AutoModeIcon,
    FormatListBulleted as FormatListBulletedIcon,
    UnfoldLess as UnfoldLessIcon,
    UnfoldMore as UnfoldMoreIcon,
} from '@mui/icons-material';

export const icons = {
    refresh: RefreshIcon,
    add: AddIcon,
    help: HelpIcon,
    update: UpdateIcon,
    build: BuildIcon,
    addToPhotos: AddToPhotosIcon,
    deleteForever: DeleteForeverIcon,
    publish: PublishIcon,
    link: LinkIcon,
    close: CloseIcon,
    monetizationOn: MonetizationOn,
    gitHub: GitHubIcon,
    cloud: CloudIcon,
    cloudOff: CloudOffIcon,
    arrowUpward: ArrowUpwardIcon,
    arrowDownward: ArrowDownwardIcon,
    remove: RemoveIcon,
    qrCode: QrCodeIcon,
    delete: DeleteIcon,
    edit: EditIcon,
    factoryReset: FactoryResetIcon,
    leakAdd: LeakAddIcon,
    noConnection: IconNoConnection,
    notAlive: IconNotAlive,
    contentCopy: ContentCopyIcon,
    questionMark: QuestionMarkIcon,
    settingsInputAntenna: SettingsInputAntennaIcon,
    signalWifiStatusbarNull: SignalWifiStatusbarNullIcon,
    wifi: WifiIcon,
    wifiOff: WifiOffIcon,
    deviceHub: DeviceHubIcon,
    autoMode: AutoModeIcon,
    formatListBulleted: FormatListBulletedIcon,
    unfoldLess: UnfoldLessIcon,
    unfoldMore: UnfoldMoreIcon,
} as const;

interface IconButtonProps {
    /** If the button is disabled */
    disabled?: boolean;
    /** Handler if button is clicked */
    onClick: () => void;
    /** Text in the tooltip */
    tooltipText?: string;
    /** The icon to display */
    icon: keyof typeof icons;
    /** If the component should have no background */
    noBackground?: boolean;
    /** Optional color of the icon, only works with no background option */
    iconColor?: 'primary' | 'warning' | 'error' | 'secondary' | 'default';
}

/**
 * This component wraps the MUI Icon Button and provides the standardized ioBroker icons
 * and functionalities like tooltip
 */
export default class IconButton extends React.Component<IconButtonProps> {
    render(): React.ReactNode {
        const Icon = icons[this.props.icon];
        return (
            <Tooltip
                title={this.props.tooltipText}
                slotProps={{
                    popper: { sx: { pointerEvents: 'none' } },
                }}
            >
                <MuiIconButton
                    color={this.props.iconColor}
                    sx={
                        this.props.noBackground
                            ? undefined
                            : {
                                  backgroundColor: theme => theme.palette.primary.main,
                                  '&:hover': { backgroundColor: theme => theme.palette.primary.light },
                                  color: theme => theme.palette.getContrastText(theme.palette.primary.dark),
                              }
                    }
                    size={'small'}
                    disabled={this.props.disabled}
                    onClick={() => this.props.onClick()}
                >
                    <Icon />
                </MuiIconButton>
            </Tooltip>
        );
    }
}
