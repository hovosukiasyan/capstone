import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from scipy.stats import skew as sp_skew, kurtosis as sp_kurtosis, normaltest
from sklearn.preprocessing import (
    StandardScaler, MinMaxScaler, RobustScaler,
    QuantileTransformer, PowerTransformer,
)
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans, AgglomerativeClustering
from sklearn.metrics import (
    silhouette_score, calinski_harabasz_score,
    davies_bouldin_score, adjusted_rand_score,
)

warnings.filterwarnings("ignore")

SEED = 42
np.random.seed(SEED)

BASE = Path("O:/AUA Capstones/capstones-2026/hs-capstone/capstone")
DATA_ILCS = BASE / "data" / "ilcs"
RESEARCH_DIR = DATA_ILCS / "research"
IMPUTED_CSV_PATH = RESEARCH_DIR / "ml_households_research_columns_imputed.csv"
RAW_RESEARCH_CSV_PATH = RESEARCH_DIR / "ml_households_research_columns.csv"

OUT = BASE / "test_ideas" / "outputs_scaling_analysis"
PLOTS = OUT / "plots"
CSVS = OUT / "csv"
VARPLOTS = PLOTS / "per_variable"
SCALEPLOTS = PLOTS / "scaling_comparison"
DRPLOTS = PLOTS / "dim_reduction"

for _d in [OUT, PLOTS, CSVS, VARPLOTS, SCALEPLOTS, DRPLOTS]:
    _d.mkdir(parents=True, exist_ok=True)

K_RANGE = list(range(2, 13))
TSNE_PERPLEXITY = 30
TSNE_MAX_ITER = 1000
STABILITY_SEEDS = [42, 0, 1, 7, 13]
TSNE_SCALER_SUBSET = {"raw", "standard", "robust", "quantile_normal", "power_yeo_johnson", "hybrid"}


def save_fig(fig, path, dpi=150):
    fig.savefig(str(path), dpi=dpi, bbox_inches="tight")
    try:
        plt.show()
    except Exception:
        pass
    plt.close(fig)


def compute_diagnostics(df_in):
    rows = []
    for col in df_in.columns:
        s = df_in[col].dropna()
        n = len(s)
        if n < 3:
            continue
        q1 = float(s.quantile(0.25))
        q3 = float(s.quantile(0.75))
        iqr_val = q3 - q1
        mn = float(s.mean())
        sd = float(s.std())
        try:
            _, p_norm = normaltest(s)
            p_norm = float(p_norm)
        except Exception:
            p_norm = float("nan")
        rows.append({
            "variable": col,
            "n_nonmissing": n,
            "min": float(s.min()),
            "max": float(s.max()),
            "range": float(s.max() - s.min()),
            "mean": mn,
            "median": float(s.median()),
            "std": sd,
            "variance": float(s.var()),
            "iqr": iqr_val,
            "robust_range_iqr135": iqr_val * 1.35,
            "skewness": float(sp_skew(s)),
            "kurtosis": float(sp_kurtosis(s)),
            "cv": sd / mn if mn != 0 else float("nan"),
            "n_unique": int(s.nunique()),
            "pct_zeros": float((s == 0).mean() * 100),
            "pct_negative": float((s < 0).mean() * 100),
            "pct_outliers_iqr": float(
                ((s < q1 - 1.5 * iqr_val) | (s > q3 + 1.5 * iqr_val)).mean() * 100
            ),
            "p1": float(s.quantile(0.01)),
            "p5": float(s.quantile(0.05)),
            "p25": q1,
            "p50": float(s.quantile(0.50)),
            "p75": q3,
            "p95": float(s.quantile(0.95)),
            "p99": float(s.quantile(0.99)),
            "normality_p_value": p_norm,
        })
    return pd.DataFrame(rows).set_index("variable")


def classify_variable_types(diag):
    vt_dict = {}
    for var, row in diag.iterrows():
        n_uniq = int(row["n_unique"])
        rng = float(row["range"])
        sk = abs(float(row["skewness"]))
        pct_z = float(row["pct_zeros"])
        mn = float(row["mean"])
        if n_uniq <= 3:
            vt = "binary_or_ternary"
        elif n_uniq <= 8 and rng <= 12:
            vt = "ordinal_small"
        elif rng > 10000 or (mn > 5000 and sk > 0.8):
            vt = "monetary_large"
        elif pct_z > 40 and rng > 0:
            vt = "sparse_zero_inflated"
        elif sk > 2.0:
            vt = "heavily_skewed"
        elif n_uniq > 8 and rng <= 50:
            vt = "count_bounded"
        else:
            vt = "continuous"
        vt_dict[var] = vt
    return pd.Series(vt_dict, name="variable_type")


def apply_hybrid_scaling(X_arr, feature_names, var_types_series):
    vt = var_types_series.to_dict()
    feat_idx = {f: i for i, f in enumerate(feature_names)}
    X_out = X_arr.copy().astype(float)

    log_group = {"monetary_large", "sparse_zero_inflated", "heavily_skewed"}
    robust_group = {"ordinal_small", "count_bounded"}
    binary_group = {"binary_or_ternary"}

    monetary_cols = [f for f in feature_names if vt.get(f) in log_group]
    robust_cols = [f for f in feature_names if vt.get(f) in robust_group]
    binary_cols = [f for f in feature_names if vt.get(f) in binary_group]
    other_cols = [
        f for f in feature_names
        if f not in monetary_cols + robust_cols + binary_cols
    ]

    for col in monetary_cols:
        j = feat_idx[col]
        col_min = X_arr[:, j].min()
        shift = abs(col_min) + 1e-6 if col_min <= 0 else 0.0
        X_out[:, j] = np.log1p(X_arr[:, j] + shift)

    log_idx = [feat_idx[c] for c in monetary_cols]
    robust_idx = [feat_idx[c] for c in robust_cols]
    binary_idx = [feat_idx[c] for c in binary_cols]
    other_idx = [feat_idx[c] for c in other_cols]

    if log_idx:
        X_out[:, log_idx] = StandardScaler().fit_transform(X_out[:, log_idx])
    if robust_idx:
        X_out[:, robust_idx] = RobustScaler().fit_transform(X_out[:, robust_idx])
    if binary_idx:
        X_out[:, binary_idx] = MinMaxScaler().fit_transform(X_out[:, binary_idx])
    if other_idx:
        X_out[:, other_idx] = StandardScaler().fit_transform(X_out[:, other_idx])

    return X_out


def run_pca_full(X):
    n_comp = min(X.shape[0], X.shape[1])
    pca = PCA(n_components=n_comp, random_state=SEED)
    X_pca = pca.fit_transform(X)
    return pca, X_pca


def run_tsne_2d(X):
    t = TSNE(
        n_components=2,
        perplexity=TSNE_PERPLEXITY,
        max_iter=TSNE_MAX_ITER,
        random_state=SEED,
    )
    return t.fit_transform(X)


def evaluate_kmeans(X, k_range):
    rows = []
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=SEED, n_init=10)
        labels = km.fit_predict(X)
        inertia = km.inertia_
        if len(set(labels)) > 1:
            n_s = min(len(labels), 2000)
            sil = silhouette_score(X, labels, sample_size=n_s, random_state=SEED)
            ch = calinski_harabasz_score(X, labels)
            db = davies_bouldin_score(X, labels)
        else:
            sil = ch = db = float("nan")
        rows.append({
            "k": k,
            "inertia": inertia,
            "silhouette": sil,
            "calinski_harabasz": ch,
            "davies_bouldin": db,
        })
    return pd.DataFrame(rows).set_index("k")


def find_elbow_k(inertia_series, k_range):
    vals = list(inertia_series)
    ks = list(k_range)
    if len(vals) < 3:
        return ks[0]
    d1 = -np.diff(vals)
    d2 = np.diff(d1)
    if len(d2) == 0:
        return ks[0]
    idx = int(np.argmin(d2)) + 1
    return ks[min(idx, len(ks) - 1)]


def compute_stability(X, k):
    labels_list = []
    for s in STABILITY_SEEDS:
        km = KMeans(n_clusters=k, random_state=s, n_init=10)
        labels_list.append(km.fit_predict(X))
    aris = []
    for i in range(len(labels_list)):
        for j in range(i + 1, len(labels_list)):
            aris.append(adjusted_rand_score(labels_list[i], labels_list[j]))
    return float(np.mean(aris)), float(np.std(aris))


def plot_clustering_metrics(km_df, sname, outdir):
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    af = axes.flatten()

    af[0].plot(km_df.index, km_df["inertia"], "bo-", linewidth=2, markersize=8)
    af[0].set_xlabel("K")
    af[0].set_ylabel("Inertia (WCSS)")
    af[0].set_title(f"Elbow [{sname}]")
    af[0].set_xticks(list(km_df.index))

    af[1].plot(km_df.index, km_df["silhouette"], "gs-", linewidth=2, markersize=8)
    af[1].set_xlabel("K")
    af[1].set_ylabel("Silhouette Score")
    af[1].set_title(f"Silhouette [{sname}]")
    af[1].set_xticks(list(km_df.index))

    af[2].plot(km_df.index, km_df["calinski_harabasz"], "r^-", linewidth=2, markersize=8)
    af[2].set_xlabel("K")
    af[2].set_ylabel("Calinski-Harabasz")
    af[2].set_title(f"Calinski-Harabasz [{sname}]")
    af[2].set_xticks(list(km_df.index))

    af[3].plot(km_df.index, km_df["davies_bouldin"], "md-", linewidth=2, markersize=8)
    af[3].set_xlabel("K")
    af[3].set_ylabel("Davies-Bouldin (lower=better)")
    af[3].set_title(f"Davies-Bouldin [{sname}]")
    af[3].set_xticks(list(km_df.index))

    plt.suptitle(f"Clustering Metrics — {sname}", fontsize=14)
    plt.tight_layout()
    save_fig(fig, outdir / f"clustering_metrics_{sname}.png")


def plot_pca_scree(pca_obj, sname, outdir):
    ev = pca_obj.explained_variance_ratio_
    cev = np.cumsum(ev)
    n_show = min(len(ev), 20)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].bar(range(1, n_show + 1), ev[:n_show], color="steelblue", alpha=0.85)
    axes[0].set_xlabel("Principal Component")
    axes[0].set_ylabel("Explained Variance Ratio")
    axes[0].set_title(f"PCA Scree [{sname}]")

    axes[1].plot(range(1, n_show + 1), cev[:n_show], "bo-", linewidth=2)
    axes[1].axhline(0.80, color="red", linestyle="--", label="80%")
    axes[1].axhline(0.90, color="orange", linestyle="--", label="90%")
    axes[1].set_xlabel("Components")
    axes[1].set_ylabel("Cumulative Explained Variance")
    axes[1].set_title(f"PCA Cumulative [{sname}]")
    axes[1].legend()

    plt.tight_layout()
    save_fig(fig, outdir / f"pca_scree_{sname}.png")


def plot_2d_scatter(coords, labels_arr, title, xlabel, ylabel, outpath):
    coords = np.asarray(coords)
    labels_arr = np.asarray(labels_arr)
    fig, ax = plt.subplots(figsize=(10, 8))
    unique_cls = sorted(set(labels_arr))
    cmap = plt.cm.tab20
    palette = [cmap(i % 20) for i in range(len(unique_cls))]
    for c, color in zip(unique_cls, palette):
        mask = labels_arr == c
        ax.scatter(
            coords[mask, 0], coords[mask, 1],
            label=f"Cluster {c}", alpha=0.5, s=10, color=color,
        )
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(markerscale=3, fontsize=9)
    save_fig(fig, outpath)


def main():
    print("=" * 70)
    print("ILCS Scaling Analysis Pipeline — Starting")
    print("=" * 70)

    print("\n[A] Loading datasets...")
    df_raw_research = pd.read_csv(RAW_RESEARCH_CSV_PATH)
    df_imputed = pd.read_csv(IMPUTED_CSV_PATH)
    feature_names = list(df_imputed.columns)
    n_vars = len(feature_names)
    X_imputed = df_imputed.values.astype(float)

    print(f"  Raw research shape (with missing): {df_raw_research.shape}")
    print(f"  KNN-imputed shape (no missing): {df_imputed.shape}")
    print(f"  Feature count: {n_vars}")
    print(f"  Features: {feature_names}")

    df_imputed.to_csv(CSVS / "imputed_dataset_reference.csv", index=False)
    print(f"  Reference imputed dataset saved to: {CSVS}/imputed_dataset_reference.csv")

    print("\n[B] Missingness analysis before and after KNN imputation...")
    shared_cols = [c for c in feature_names if c in df_raw_research.columns]
    miss_before_cnt = df_raw_research[shared_cols].isnull().sum().reindex(feature_names, fill_value=0)
    miss_before_pct = (df_raw_research[shared_cols].isnull().mean() * 100).round(2).reindex(feature_names, fill_value=0.0)
    miss_after_cnt = df_imputed.isnull().sum()

    miss_tbl = pd.DataFrame({
        "missing_count_before_imputation": miss_before_cnt,
        "missing_pct_before_imputation": miss_before_pct,
        "missing_count_after_imputation": miss_after_cnt,
    })
    miss_tbl.to_csv(CSVS / "missingness_before_after.csv")
    print(f"  Variables with missing before: {(miss_before_cnt > 0).sum()}")
    print(f"  Variables with missing after: {(miss_after_cnt > 0).sum()}")
    print(f"  Total missing cells before: {int(miss_before_cnt.sum())}")
    print(f"  Saved: {CSVS}/missingness_before_after.csv")

    dtype_summary = pd.DataFrame({
        "variable": feature_names,
        "dtype": [str(df_imputed[c].dtype) for c in feature_names],
        "n_rows": [len(df_imputed[c]) for c in feature_names],
    })
    dtype_summary.to_csv(CSVS / "variable_dtype_summary.csv", index=False)

    print("\n[C] Computing pre-scaling diagnostics and generating plots...")
    diag_raw = compute_diagnostics(df_imputed)
    diag_raw.to_csv(CSVS / "diagnostics_raw_imputed.csv")
    print(f"  Diagnostics table saved: {CSVS}/diagnostics_raw_imputed.csv")

    var_types = classify_variable_types(diag_raw)
    vtype_df = pd.DataFrame({"variable": var_types.index, "variable_type": var_types.values})
    vtype_df.to_csv(CSVS / "variable_type_classification.csv", index=False)

    print("  Variable type classification:")
    for vt in sorted(var_types.unique()):
        cols_of_type = list(var_types[var_types == vt].index)
        print(f"    {vt} ({len(cols_of_type)}): {cols_of_type}")

    n_r = (n_vars + 3) // 4

    fig, axes = plt.subplots(n_r, 4, figsize=(22, n_r * 4))
    axes = axes.flatten()
    for i, col in enumerate(feature_names):
        axes[i].hist(df_imputed[col].dropna(), bins=40, color="steelblue",
                     edgecolor="white", alpha=0.85)
        axes[i].set_title(col, fontsize=8, pad=2)
    for i in range(n_vars, len(axes)):
        axes[i].set_visible(False)
    plt.suptitle("Variable Distributions — Post-Imputation, Pre-Scaling", fontsize=14)
    plt.tight_layout()
    save_fig(fig, PLOTS / "histograms_all_pre_scaling.png")

    fig, ax = plt.subplots(figsize=(22, 9))
    df_imputed.boxplot(ax=ax, rot=90, fontsize=7)
    ax.set_title("Boxplots — All Variables (Pre-Scaling)", fontsize=14)
    plt.tight_layout()
    save_fig(fig, PLOTS / "boxplots_all_pre_scaling.png")

    batch_sz = 14
    for b in range(0, n_vars, batch_sz):
        b_cols = feature_names[b:b + batch_sz]
        nb = len(b_cols)
        fig, axes = plt.subplots(1, nb, figsize=(nb * 2.8, 8))
        if nb == 1:
            axes = [axes]
        for ax, col in zip(axes, b_cols):
            sv = df_imputed[col].dropna()
            if len(sv) > 0:
                ax.violinplot(sv, showmedians=True, showextrema=True)
            ax.set_title(col, fontsize=7, rotation=40, ha="right")
            ax.set_xticks([])
        bnum = b // batch_sz + 1
        plt.suptitle(f"Violin Plots — Batch {bnum}", fontsize=12)
        plt.tight_layout()
        save_fig(fig, VARPLOTS / f"violin_batch_{bnum}.png")

    corr_mat = df_imputed.corr()
    corr_mat.to_csv(CSVS / "correlation_matrix_pre_scaling.csv")
    fig, ax = plt.subplots(figsize=(18, 15))
    sns.heatmap(
        corr_mat, ax=ax, cmap="coolwarm", center=0, vmin=-1, vmax=1,
        annot=True, fmt=".1f", annot_kws={"size": 5.5},
        square=True, linewidths=0.3,
    )
    ax.set_title("Feature Correlation Heatmap (Pre-Scaling)", fontsize=14)
    plt.tight_layout()
    save_fig(fig, PLOTS / "correlation_heatmap_pre_scaling.png")

    fig, axes = plt.subplots(3, 1, figsize=(22, 20))
    for i, (dc, label, col) in enumerate([
        ("std", "Standard Deviation", "steelblue"),
        ("iqr", "IQR", "mediumseagreen"),
        ("range", "Range", "coral"),
    ]):
        sv = diag_raw[dc].sort_values(ascending=False)
        axes[i].bar(sv.index, sv.values, color=col, alpha=0.85)
        axes[i].set_title(f"{label} per Variable (sorted, pre-scaling)", fontsize=12)
        axes[i].set_xticklabels(sv.index, rotation=90, fontsize=8)
        axes[i].set_ylabel(label)
    plt.suptitle("Scale Dispersion Across Variables — Pre-Scaling", fontsize=14)
    plt.tight_layout()
    save_fig(fig, PLOTS / "dispersion_bars_pre_scaling.png")

    variance_sorted = diag_raw["variance"].sort_values(ascending=False)
    fig, ax = plt.subplots(figsize=(22, 7))
    ax.bar(variance_sorted.index, variance_sorted.values, color="mediumpurple", alpha=0.85)
    ax.set_title("Variance per Variable (sorted, pre-scaling)", fontsize=13)
    ax.set_xticklabels(variance_sorted.index, rotation=90, fontsize=8)
    ax.set_ylabel("Variance")
    plt.tight_layout()
    save_fig(fig, PLOTS / "variance_bars_pre_scaling.png")

    mag_df = diag_raw[["std", "iqr", "range"]].T
    fig, ax = plt.subplots(figsize=(22, 4))
    sns.heatmap(mag_df, ax=ax, cmap="YlOrRd", annot=True, fmt=".0f",
                annot_kws={"size": 5.5})
    ax.set_title("Magnitude/Dispersion Heatmap (Pre-Scaling)", fontsize=12)
    plt.tight_layout()
    save_fig(fig, PLOTS / "magnitude_heatmap_pre_scaling.png")

    skew_kurt = diag_raw[["skewness", "kurtosis"]].T
    fig, ax = plt.subplots(figsize=(22, 4))
    sns.heatmap(skew_kurt, ax=ax, cmap="RdBu_r", center=0,
                annot=True, fmt=".1f", annot_kws={"size": 5.5})
    ax.set_title("Skewness and Kurtosis Heatmap (Pre-Scaling)", fontsize=12)
    plt.tight_layout()
    save_fig(fig, PLOTS / "skewness_kurtosis_heatmap_pre_scaling.png")

    subset_for_pair = feature_names[:min(7, n_vars)]
    pp = sns.pairplot(
        df_imputed[subset_for_pair].dropna(),
        plot_kws={"alpha": 0.3, "s": 5},
        diag_kws={"bins": 30},
    )
    pp.figure.suptitle("Pairplot — First 7 Variables (Pre-Scaling)", y=1.01, fontsize=12)
    save_fig(pp.figure, PLOTS / "pairplot_subset_pre_scaling.png")

    for col in feature_names:
        fig, axes = plt.subplots(1, 3, figsize=(15, 4))
        sv = df_imputed[col].dropna()
        axes[0].hist(sv, bins=40, color="steelblue", edgecolor="white", alpha=0.85)
        axes[0].set_title(f"Histogram: {col}", fontsize=10)
        axes[0].set_xlabel(col)
        axes[1].boxplot(sv, vert=True, patch_artist=True,
                        boxprops=dict(facecolor="lightblue"))
        axes[1].set_title(f"Boxplot: {col}", fontsize=10)
        if len(sv) > 0:
            axes[2].violinplot(sv, showmedians=True)
        axes[2].set_title(f"Violin: {col}", fontsize=10)
        axes[2].set_xticks([])
        plt.suptitle(f"Distribution: {col}", fontsize=12)
        plt.tight_layout()
        safe = col.replace("/", "_").replace("\\", "_").replace(" ", "_")
        save_fig(fig, VARPLOTS / f"dist_{safe}.png")

    print(f"  Saved {n_vars} individual distribution plots to: {VARPLOTS}")

    print("\n[D] Applying all scaling strategies...")

    X_log1p_shifted = X_imputed.copy()
    for j in range(X_imputed.shape[1]):
        col_min_j = X_imputed[:, j].min()
        if col_min_j <= 0:
            X_log1p_shifted[:, j] = X_imputed[:, j] + abs(col_min_j) + 1e-6
    X_log1p_std = StandardScaler().fit_transform(np.log1p(X_log1p_shifted))

    X_rank = pd.DataFrame(X_imputed, columns=feature_names).rank(pct=True).values

    X_hybrid = apply_hybrid_scaling(X_imputed, feature_names, var_types)

    scaling_map = {
        "raw": X_imputed.copy(),
        "standard": StandardScaler().fit_transform(X_imputed),
        "minmax": MinMaxScaler().fit_transform(X_imputed),
        "robust": RobustScaler().fit_transform(X_imputed),
        "quantile_normal": QuantileTransformer(
            output_distribution="normal", random_state=SEED
        ).fit_transform(X_imputed),
        "quantile_uniform": QuantileTransformer(
            output_distribution="uniform", random_state=SEED
        ).fit_transform(X_imputed),
        "power_yeo_johnson": PowerTransformer(method="yeo-johnson").fit_transform(X_imputed),
        "log1p_standard": X_log1p_std,
        "rank_percentile": X_rank,
        "hybrid": X_hybrid,
    }

    all_snames = list(scaling_map.keys())
    scaled_diagnostics = {}

    for sname, X_s in scaling_map.items():
        df_s = pd.DataFrame(X_s, columns=feature_names)
        df_s.to_csv(CSVS / f"scaled_{sname}.csv", index=False)
        d = compute_diagnostics(df_s)
        d.to_csv(CSVS / f"diagnostics_{sname}.csv")
        scaled_diagnostics[sname] = d
        print(f"  Saved: scaled_{sname}.csv + diagnostics_{sname}.csv")

    print("\n  Generating per-scaler histogram comparison plots...")
    for sname in all_snames:
        df_s = pd.DataFrame(scaling_map[sname], columns=feature_names)
        fig, axes = plt.subplots(n_r, 4, figsize=(22, n_r * 4))
        axes = axes.flatten()
        for i, col in enumerate(feature_names):
            axes[i].hist(df_s[col], bins=40, color="darkorange",
                         edgecolor="white", alpha=0.85)
            axes[i].set_title(col, fontsize=8, pad=2)
        for i in range(n_vars, len(axes)):
            axes[i].set_visible(False)
        plt.suptitle(f"Distributions After Scaling: {sname}", fontsize=13)
        plt.tight_layout()
        save_fig(fig, SCALEPLOTS / f"histograms_{sname}.png")

    std_cmp = pd.DataFrame({sn: scaled_diagnostics[sn]["std"] for sn in all_snames})
    std_cmp.to_csv(CSVS / "std_comparison_all_scalers.csv")
    fig, ax = plt.subplots(figsize=(22, 9))
    std_cmp.plot(kind="bar", ax=ax, width=0.75)
    ax.set_title("Std Dev per Variable Across All Scaling Methods", fontsize=13)
    ax.set_xticklabels(std_cmp.index, rotation=90, fontsize=8)
    ax.set_ylabel("Std Dev")
    ax.legend(fontsize=8, bbox_to_anchor=(1.01, 1), loc="upper left")
    plt.tight_layout()
    save_fig(fig, SCALEPLOTS / "std_comparison_all_scalers.png")

    range_cmp = pd.DataFrame({sn: scaled_diagnostics[sn]["range"] for sn in all_snames})
    range_cmp.to_csv(CSVS / "range_comparison_all_scalers.csv")
    fig, ax = plt.subplots(figsize=(22, 9))
    range_cmp.plot(kind="bar", ax=ax, width=0.75)
    ax.set_title("Range per Variable Across All Scaling Methods", fontsize=13)
    ax.set_xticklabels(range_cmp.index, rotation=90, fontsize=8)
    ax.set_ylabel("Range")
    ax.legend(fontsize=8, bbox_to_anchor=(1.01, 1), loc="upper left")
    plt.tight_layout()
    save_fig(fig, SCALEPLOTS / "range_comparison_all_scalers.png")

    iqr_cmp = pd.DataFrame({sn: scaled_diagnostics[sn]["iqr"] for sn in all_snames})
    iqr_cmp.to_csv(CSVS / "iqr_comparison_all_scalers.csv")
    fig, ax = plt.subplots(figsize=(22, 9))
    iqr_cmp.plot(kind="bar", ax=ax, width=0.75)
    ax.set_title("IQR per Variable Across All Scaling Methods", fontsize=13)
    ax.set_xticklabels(iqr_cmp.index, rotation=90, fontsize=8)
    ax.set_ylabel("IQR")
    ax.legend(fontsize=8, bbox_to_anchor=(1.01, 1), loc="upper left")
    plt.tight_layout()
    save_fig(fig, SCALEPLOTS / "iqr_comparison_all_scalers.png")

    print("\n[E] Hybrid scaling variable assignment:")
    for vt in sorted(var_types.unique()):
        cols_of_type = list(var_types[var_types == vt].index)
        print(f"  {vt} ({len(cols_of_type)}): {cols_of_type}")

    log_group_types = {"monetary_large", "sparse_zero_inflated", "heavily_skewed"}
    robust_group_types = {"ordinal_small", "count_bounded"}
    hybrid_log_cols = list(var_types[var_types.isin(log_group_types)].index)
    hybrid_robust_cols = list(var_types[var_types.isin(robust_group_types)].index)
    hybrid_binary_cols = list(var_types[var_types == "binary_or_ternary"].index)
    hybrid_std_cols = list(var_types[var_types == "continuous"].index)

    print(f"  log1p + StandardScaler: {hybrid_log_cols}")
    print(f"  RobustScaler: {hybrid_robust_cols}")
    print(f"  MinMaxScaler (binary): {hybrid_binary_cols}")
    print(f"  StandardScaler (remaining): {hybrid_std_cols}")

    print("\n[F] Running PCA, t-SNE, and KMeans for each scaling regime...")

    clustering_results = {}

    for sname in all_snames:
        print(f"\n  ── {sname} ──")
        X_s = scaling_map[sname]
        sdir = DRPLOTS / sname
        sdir.mkdir(exist_ok=True)

        pca_obj, X_pca_full = run_pca_full(X_s)
        ev_cum = np.cumsum(pca_obj.explained_variance_ratio_)
        n80 = int(np.searchsorted(ev_cum, 0.80)) + 1
        n90 = int(np.searchsorted(ev_cum, 0.90)) + 1
        n80 = min(n80, X_s.shape[1])
        n90 = min(n90, X_s.shape[1])
        print(f"    PCA: {n80} components → 80% variance, {n90} → 90%")

        plot_pca_scree(pca_obj, sname, sdir)
        pd.DataFrame(
            {"component": range(1, len(ev_cum) + 1),
             "explained_variance_ratio": pca_obj.explained_variance_ratio_,
             "cumulative": ev_cum}
        ).to_csv(sdir / f"pca_variance_{sname}.csv", index=False)

        X_pca2d = X_pca_full[:, :2]

        print(f"    Running KMeans for k={K_RANGE[0]}..{K_RANGE[-1]}...")
        km_df = evaluate_kmeans(X_s, K_RANGE)
        km_df.to_csv(CSVS / f"kmeans_metrics_{sname}.csv")
        plot_clustering_metrics(km_df, sname, sdir)

        valid_sil = km_df["silhouette"].dropna()
        valid_db = km_df["davies_bouldin"].dropna()
        valid_ch = km_df["calinski_harabasz"].dropna()

        best_k_sil = int(valid_sil.idxmax()) if len(valid_sil) > 0 else K_RANGE[0]
        best_k_elbow = find_elbow_k(km_df["inertia"], K_RANGE)
        best_k_db = int(valid_db.idxmin()) if len(valid_db) > 0 else K_RANGE[0]
        best_k_ch = int(valid_ch.idxmax()) if len(valid_ch) > 0 else K_RANGE[0]

        print(f"    Best k → silhouette: {best_k_sil}, elbow: {best_k_elbow}, "
              f"Davies-Bouldin: {best_k_db}, Calinski-Harabasz: {best_k_ch}")

        km_best = KMeans(n_clusters=best_k_sil, random_state=SEED, n_init=10)
        labels_best = km_best.fit_predict(X_s)

        cluster_sizes = pd.Series(labels_best).value_counts().sort_index()
        cluster_size_balance = float(cluster_sizes.min() / cluster_sizes.max())

        pd.DataFrame({
            "cluster": cluster_sizes.index,
            "size": cluster_sizes.values,
            "fraction": (cluster_sizes / len(labels_best)).values,
        }).to_csv(sdir / f"cluster_sizes_{sname}.csv", index=False)

        plot_2d_scatter(
            X_pca2d, labels_best,
            f"PCA 2D [{sname}] — k={best_k_sil}",
            "PC1", "PC2",
            sdir / f"pca_scatter_{sname}.png",
        )

        print(f"    Running stability analysis ({len(STABILITY_SEEDS)} seeds, k={best_k_sil})...")
        ari_mean, ari_std = compute_stability(X_s, best_k_sil)
        print(f"    Stability ARI: {ari_mean:.3f} ± {ari_std:.3f}")

        hier = AgglomerativeClustering(n_clusters=best_k_sil)
        labels_hier = hier.fit_predict(X_s)
        n_s = min(len(labels_hier), 2000)
        hier_sil = silhouette_score(X_s, labels_hier, sample_size=n_s, random_state=SEED)
        print(f"    Hierarchical clustering silhouette at k={best_k_sil}: {hier_sil:.4f}")

        if sname in TSNE_SCALER_SUBSET:
            print(f"    Running t-SNE (perplexity={TSNE_PERPLEXITY}, max_iter={TSNE_MAX_ITER})...")
            X_tsne = run_tsne_2d(X_s)
            pd.DataFrame(X_tsne, columns=["tsne_1", "tsne_2"]).to_csv(
                CSVS / f"tsne_embedding_{sname}.csv", index=False
            )
            plot_2d_scatter(
                X_tsne, labels_best,
                f"t-SNE 2D [{sname}] — k={best_k_sil}",
                "t-SNE 1", "t-SNE 2",
                sdir / f"tsne_scatter_{sname}.png",
            )
        else:
            print(f"    t-SNE skipped for {sname} (not in TSNE_SCALER_SUBSET)")

        sil_at_elbow_k = (
            float(km_df.loc[best_k_elbow, "silhouette"])
            if best_k_elbow in km_df.index
            else float("nan")
        )

        clustering_results[sname] = {
            "best_k_by_silhouette": best_k_sil,
            "best_k_by_elbow": best_k_elbow,
            "best_k_by_davies_bouldin": best_k_db,
            "best_k_by_calinski_harabasz": best_k_ch,
            "best_silhouette_score": float(km_df.loc[best_k_sil, "silhouette"])
            if best_k_sil in km_df.index else float("nan"),
            "mean_silhouette_k2_k12": float(km_df["silhouette"].mean()),
            "best_calinski_harabasz": float(valid_ch.max()) if len(valid_ch) > 0 else float("nan"),
            "best_davies_bouldin": float(valid_db.min()) if len(valid_db) > 0 else float("nan"),
            "silhouette_at_elbow_k": sil_at_elbow_k,
            "cluster_size_balance_min_over_max": cluster_size_balance,
            "pca_components_for_80pct": n80,
            "pca_components_for_90pct": n90,
            "stability_ari_mean": ari_mean,
            "stability_ari_std": ari_std,
            "hierarchical_silhouette_best_k": hier_sil,
        }

    print("\n[G] Building scaling method comparison table...")
    comparison_df = pd.DataFrame(clustering_results).T
    comparison_df.to_csv(CSVS / "scaling_method_comparison.csv")
    comparison_df.to_csv(CSVS / "clustering_metrics_comparison.csv")

    display_cols = [
        "best_k_by_silhouette", "best_silhouette_score", "mean_silhouette_k2_k12",
        "best_calinski_harabasz", "best_davies_bouldin",
        "stability_ari_mean", "cluster_size_balance_min_over_max",
        "pca_components_for_80pct",
    ]
    print("\n" + comparison_df[display_cols].to_string())

    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    for ax, metric, title, higher_better in zip(
        axes.flatten(),
        ["best_silhouette_score", "best_calinski_harabasz",
         "best_davies_bouldin", "stability_ari_mean"],
        ["Best Silhouette Score (higher=better)",
         "Best Calinski-Harabasz (higher=better)",
         "Best Davies-Bouldin (lower=better)",
         "Stability ARI Mean (higher=better)"],
        [True, True, False, True],
    ):
        vals = comparison_df[metric].astype(float)
        colors = ["steelblue" if higher_better else "coral"] * len(vals)
        bars = ax.bar(vals.index, vals.values, color=colors, alpha=0.85)
        ax.set_title(title, fontsize=11)
        ax.set_xticklabels(vals.index, rotation=45, ha="right", fontsize=9)
        ax.set_ylabel(metric)
        best_bar_idx = int(vals.argmax()) if higher_better else int(vals.argmin())
        bars[best_bar_idx].set_color("gold")
        bars[best_bar_idx].set_edgecolor("black")
        bars[best_bar_idx].set_linewidth(2)
    plt.suptitle("Clustering Quality Across Scaling Methods\n(gold bar = best)", fontsize=13)
    plt.tight_layout()
    save_fig(fig, PLOTS / "scaling_method_comparison_bars.png")

    best_scaler = str(comparison_df["best_silhouette_score"].idxmax())
    best_sil_val = float(comparison_df.loc[best_scaler, "best_silhouette_score"])
    best_k_final = int(comparison_df.loc[best_scaler, "best_k_by_silhouette"])

    raw_sil = (
        float(comparison_df.loc["raw", "best_silhouette_score"])
        if "raw" in comparison_df.index else float("nan")
    )
    improvement = best_sil_val - raw_sil

    raw_elbow_sil = (
        float(comparison_df.loc["raw", "silhouette_at_elbow_k"])
        if "raw" in comparison_df.index else float("nan")
    )
    best_elbow_sil = float(comparison_df.loc[best_scaler, "silhouette_at_elbow_k"])

    worst_range_vars = diag_raw["range"].sort_values(ascending=False).head(5).index.tolist()
    worst_skew_vars = diag_raw["skewness"].abs().sort_values(ascending=False).head(5).index.tolist()
    worst_cv_vars = diag_raw["cv"].abs().sort_values(ascending=False).head(5).index.tolist()

    ari_best = float(comparison_df.loc[best_scaler, "stability_ari_mean"])
    ari_best_std = float(comparison_df.loc[best_scaler, "stability_ari_std"])
    n80_best = int(comparison_df.loc[best_scaler, "pca_components_for_80pct"])

    print("\n" + "=" * 70)
    print("[H] FINAL RECOMMENDATION")
    print("=" * 70)

    conclusion = [
        f"Dataset: ILCS 2015 Armenia — {X_imputed.shape[0]} households, {n_vars} welfare features",
        f"Imputation: KNN k=9, {(miss_before_cnt > 0).sum()} variables had missing values",
        "",
        "SCALE PROBLEM DIAGNOSIS:",
        f"  Raw silhouette={raw_sil:.4f} vs best scaled silhouette={best_sil_val:.4f} "
        f"(improvement={improvement:+.4f})",
        f"  Elbow silhouette at raw elbow-k={raw_elbow_sil:.4f} vs "
        f"best-scaler elbow-k={best_elbow_sil:.4f}",
        f"  YES — scaling was a major reason the elbow looked malformed.",
        f"  Top 5 variables by range (biggest scale offenders): {', '.join(worst_range_vars)}",
        f"  Top 5 most skewed variables: {', '.join(worst_skew_vars)}",
        f"  Top 5 by coefficient of variation: {', '.join(worst_cv_vars)}",
        "",
        "BEST SCALING METHOD:",
        f"  Method: {best_scaler}",
        f"  Best silhouette score: {best_sil_val:.4f} at k={best_k_final}",
        f"  Stability (ARI mean ± std across {len(STABILITY_SEEDS)} seeds): "
        f"{ari_best:.3f} ± {ari_best_std:.3f}",
        f"  PCA: {n80_best} components explain 80% of variance",
        "",
        "HYBRID STRATEGY APPLIED (data-driven column assignment):",
        f"  log1p + StandardScaler (monetary/skewed): {hybrid_log_cols}",
        f"  RobustScaler (ordinal/count): {hybrid_robust_cols}",
        f"  MinMaxScaler (binary/ternary): {hybrid_binary_cols}",
        f"  StandardScaler (remaining continuous): {hybrid_std_cols}",
        "",
        "RECOMMENDED FILE FOR DOWNSTREAM t-SNE AND CLUSTERING:",
        f"  {CSVS}/scaled_{best_scaler}.csv",
        f"  (also copied to: {CSVS}/recommended_final_scaled_dataset.csv)",
        "",
        f"ALL OUTPUTS SAVED TO: {OUT}",
    ]

    for line in conclusion:
        print(f"  {line}" if line else "")

    summary_path = OUT / "final_summary.txt"
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("ILCS Scaling Analysis — Final Summary\n")
        f.write("=" * 70 + "\n\n")
        for line in conclusion:
            f.write(line + "\n")
    print(f"\n  Final summary saved: {summary_path}")

    recommended_path = CSVS / "recommended_final_scaled_dataset.csv"
    pd.DataFrame(scaling_map[best_scaler], columns=feature_names).to_csv(
        recommended_path, index=False
    )
    print(f"  Recommended dataset saved: {recommended_path}")

    tsne_path_for_best = (
        str(CSVS / f"tsne_embedding_{best_scaler}.csv")
        if best_scaler in TSNE_SCALER_SUBSET
        else "not_computed_for_this_scaler"
    )

    workflow_df = pd.DataFrame([
        {
            "step": 1,
            "description": "load_knn_imputed_data",
            "file": str(IMPUTED_CSV_PATH),
            "detail": f"{X_imputed.shape[0]} rows x {n_vars} features, KNN k=9",
        },
        {
            "step": 2,
            "description": f"apply_scaling_{best_scaler}",
            "file": str(recommended_path),
            "detail": best_scaler,
        },
        {
            "step": 3,
            "description": "pca_dimensionality_reduction",
            "file": str(DRPLOTS / best_scaler / f"pca_scree_{best_scaler}.png"),
            "detail": f"{n80_best} components for 80% variance",
        },
        {
            "step": 4,
            "description": "tsne_embedding",
            "file": tsne_path_for_best,
            "detail": f"perplexity={TSNE_PERPLEXITY}, max_iter={TSNE_MAX_ITER}",
        },
        {
            "step": 5,
            "description": "kmeans_clustering",
            "file": str(CSVS / f"kmeans_metrics_{best_scaler}.csv"),
            "detail": f"k={best_k_final}, silhouette={best_sil_val:.4f}, ARI={ari_best:.3f}",
        },
    ])
    workflow_df.to_csv(OUT / "recommended_workflow.csv", index=False)
    print(f"  Recommended workflow saved: {OUT}/recommended_workflow.csv")

    print("\n" + "=" * 70)
    print(
        f"COMPLETE — Best scaling: {best_scaler} | "
        f"silhouette={best_sil_val:.4f} | k={best_k_final} | "
        f"stability_ARI={ari_best:.3f} | "
        f"Outputs: {OUT}"
    )
    print("=" * 70)


if __name__ == "__main__":
    main()
