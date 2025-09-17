import * as z from "zod";

export const ZRepository = z.object({
    name: z.string(),
    owner: z.string().optional(),
    lastUpdated: z.string(),
    description: z.string().optional(),
    url: z.string().url(),
    stars: z.number().int().optional(),
    language: z.string().optional()
});

export const ZFindRecentReposResponse = z.object({
    repositories: z.array(ZRepository)
});

export const ZCommit = z.object({
    id: z.string(),
    url: z.string().url(),
    author: z.string(),
    date: z.string(),
    message: z.string(),
});

export const ZGetRecentCommitsResponse = z.object({
    summary: z.string(),
    repository: z.object({
        name: z.string(),
        url: z.string().url()
    }),
    commits: z.array(ZCommit)
});

export type Repository = z.infer<typeof ZRepository>;
export type FindRecentReposResponse = z.infer<typeof ZFindRecentReposResponse>;
export type GetRecentCommitsResponse = z.infer<typeof ZGetRecentCommitsResponse>;