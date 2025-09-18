import * as z from "zod";

export const ZRepository = z.object({
    name: z.string(),
    owner: z.string().optional(),
    lastUpdated: z.string(),
    description: z.string().optional(),
    url: z.string().url(),
    stars: z.number().int().optional(),
    language: z.string().optional(),
});

export const ZRecentReposResponse = z.object({
    repositories: z.array(ZRepository)
});

export const ZCommit = z.object({
    id: z.string(),
    url: z.string().url(),
    author: z.string(),
    date: z.string(),
    message: z.string(),
});

export const ZRecentCommitsResponse = z.object({
    summary: z.string(),
    repository: z.object({
        name: z.string(),
        url: z.string().url()
    }),
    commits: z.array(ZCommit).optional()
});

export const ZDefaultBranchResponse = z.object({
    repositoryName: z.string(),
    owner: z.string(),
    defaultBranch: z.string()
})

export type Repository = z.infer<typeof ZRepository>;
export type Commit = z.infer<typeof ZCommit>;
export type RecentReposResponse = z.infer<typeof ZRecentReposResponse>;
export type RecentCommitsResponse = z.infer<typeof ZRecentCommitsResponse>;
export type DefaultBranchResponse = z.infer<typeof ZDefaultBranchResponse>;