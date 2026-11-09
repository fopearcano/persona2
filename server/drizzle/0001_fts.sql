-- Indici lessicali FTS5 (migrazione personalizzata).
-- Tokenizer unicode61 con rimozione dei diacritici: funziona per alfabeti latini, cirillici, greci ecc.
-- NON fornisce comprensione semantica multilingue né segmentazione CJK (previsti con embedding locali).
CREATE VIRTUAL TABLE `memories_fts` USING fts5(`memory_id` UNINDEXED, `content`, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER `memories_fts_ai` AFTER INSERT ON `memories` BEGIN
  INSERT INTO `memories_fts` (`memory_id`, `content`) VALUES (new.`id`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `memories_fts_ad` AFTER DELETE ON `memories` BEGIN
  DELETE FROM `memories_fts` WHERE `memory_id` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `memories_fts_au` AFTER UPDATE OF `content` ON `memories` BEGIN
  UPDATE `memories_fts` SET `content` = new.`content` WHERE `memory_id` = old.`id`;
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE `knowledge_fts` USING fts5(`chunk_id` UNINDEXED, `content`, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER `knowledge_fts_ai` AFTER INSERT ON `knowledge_chunks` BEGIN
  INSERT INTO `knowledge_fts` (`chunk_id`, `content`) VALUES (new.`id`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_fts_ad` AFTER DELETE ON `knowledge_chunks` BEGIN
  DELETE FROM `knowledge_fts` WHERE `chunk_id` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_fts_au` AFTER UPDATE OF `content` ON `knowledge_chunks` BEGIN
  UPDATE `knowledge_fts` SET `content` = new.`content` WHERE `chunk_id` = old.`id`;
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE `messages_fts` USING fts5(`message_id` UNINDEXED, `content`, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai` AFTER INSERT ON `messages` BEGIN
  INSERT INTO `messages_fts` (`message_id`, `content`) VALUES (new.`id`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad` AFTER DELETE ON `messages` BEGIN
  DELETE FROM `messages_fts` WHERE `message_id` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au` AFTER UPDATE OF `content` ON `messages` BEGIN
  UPDATE `messages_fts` SET `content` = new.`content` WHERE `message_id` = old.`id`;
END;
