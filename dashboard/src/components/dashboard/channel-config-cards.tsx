import { memo, useState } from "react";
import { Building2, Check, ChevronsUpDown, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Channel } from "./types";

type ChannelConfigCardsProps = {
  loadingConfig: boolean;
  textChannels: Channel[];
  logChannelId: string;
  lfgChannelId: string;
  selectedGuildId: string;
  onLogChannelChange: (channelId: string) => void;
  onLfgChannelChange: (channelId: string) => void;
};

function ChannelConfigCardsComponent({
  loadingConfig,
  textChannels,
  logChannelId,
  lfgChannelId,
  selectedGuildId,
  onLogChannelChange,
  onLfgChannelChange,
}: ChannelConfigCardsProps) {
  const [logChannelOpen, setLogChannelOpen] = useState(false);
  const [lfgChannelOpen, setLfgChannelOpen] = useState(false);

  const selectedLogChannel = textChannels.find(
    (channel) => channel.id === logChannelId
  );
  const logChannelLabel = selectedLogChannel
    ? `#${selectedLogChannel.name}`
    : logChannelId
      ? `ID: ${logChannelId}`
      : "Pick a text channel";

  const selectedLfgChannel = textChannels.find(
    (channel) => channel.id === lfgChannelId
  );
  const lfgChannelLabel = selectedLfgChannel
    ? `#${selectedLfgChannel.name}`
    : lfgChannelId
      ? `ID: ${lfgChannelId}`
      : "Use log channel";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-4 w-4" />
            Guild (locked)
          </CardTitle>
          <CardDescription>
            This dashboard is scoped to a single server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Locked
          </Badge>
          <div className="text-sm text-foreground">
            Guild ID: <span className="font-mono">{selectedGuildId}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Update this ID in the dashboard component if you ever migrate.
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareText className="h-4 w-4" />
            Log channel
          </CardTitle>
          <CardDescription>
            Choose where join events should be posted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingConfig ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Popover open={logChannelOpen} onOpenChange={setLogChannelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={logChannelOpen}
                  className="w-full justify-between"
                  disabled={textChannels.length === 0}
                >
                  {logChannelLabel}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Search channels..." />
                  <CommandEmpty>No channels found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      {textChannels.map((channel) => (
                        <CommandItem
                          key={channel.id}
                          value={`${channel.name} ${channel.id}`}
                          onSelect={() => {
                            onLogChannelChange(channel.id);
                            setLogChannelOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              logChannelId === channel.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <span>#{channel.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground font-mono">
                            {channel.id}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          {!loadingConfig && textChannels.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No text channels were found for this guild.
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            This channel receives the join messages.
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareText className="h-4 w-4" />
            LFG channel
          </CardTitle>
          <CardDescription>
            Optional. Defaults to the log channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingConfig ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Popover open={lfgChannelOpen} onOpenChange={setLfgChannelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={lfgChannelOpen}
                  className="w-full justify-between"
                  disabled={textChannels.length === 0}
                >
                  {lfgChannelLabel}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Search channels..." />
                  <CommandEmpty>No channels found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        value="Use log channel"
                        onSelect={() => {
                          onLfgChannelChange("");
                          setLfgChannelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            lfgChannelId === "" ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span>Use log channel</span>
                      </CommandItem>
                      {textChannels.map((channel) => (
                        <CommandItem
                          key={channel.id}
                          value={`${channel.name} ${channel.id}`}
                          onSelect={() => {
                            onLfgChannelChange(channel.id);
                            setLfgChannelOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              lfgChannelId === channel.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <span>#{channel.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground font-mono">
                            {channel.id}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          {!loadingConfig && textChannels.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No text channels were found for this guild.
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            LFG posts go here when set; otherwise they use the log channel.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const ChannelConfigCards = memo(ChannelConfigCardsComponent);
