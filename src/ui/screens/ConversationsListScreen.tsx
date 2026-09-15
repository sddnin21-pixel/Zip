import React, { useEffect } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useConversationsStore } from "../../state/conversations-store";
import type { Conversation } from "../../core/conversation/conversation-types";
import { useTheme } from "../theme/use-theme";
import { spacing, radius, typography } from "../theme/tokens";

export function ConversationsListScreen({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { colors } = useTheme();
  const { conversations, searchQuery, setSearchQuery, load, pin, archive, remove } = useConversationsStore();

  useEffect(() => {
    void load();
  }, [load]);

  const handleLongPress = (conversation: Conversation) => {
    Alert.alert(conversation.title, undefined, [
      { text: conversation.pinned ? "Unpin" : "Pin", onPress: () => pin(conversation.id, !conversation.pinned) },
      { text: "Archive", onPress: () => archive(conversation.id, true) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete conversation?", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => remove(conversation.id) },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search conversations..."
          placeholderTextColor={colors.textTertiary}
          style={[styles.search, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Pressable onPress={onNew} style={[styles.newButton, { backgroundColor: colors.accent }]}>
          <Text style={{ color: "#FFF", fontWeight: "700" }}>+ New</Text>
        </Pressable>
      </View>

      <FlashList
        data={conversations}
        keyExtractor={(item: Conversation) => item.id}
        estimatedItemSize={64}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }: { item: Conversation }) => (
          <Pressable
            onPress={() => onOpen(item.id)}
            onLongPress={() => handleLongPress(item)}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {item.pinned && <Text style={{ marginRight: spacing.xs }}>📌</Text>}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.xs }}>
                {new Date(item.updatedAt).toLocaleString()}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }}>
            No conversations yet.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  search: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.base },
  newButton: { paddingHorizontal: spacing.md, justifyContent: "center", borderRadius: radius.md },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
});
